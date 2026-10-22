// 测试角色：真实 Pi 引擎/真实模型网关连通性冒烟（2026-10-22 后台任务 E2E 第 1 步）。
//
// 只读取进程环境中的网关配置（ANS_PI_BASE_URL / ANS_PI_MODEL / ANTHROPIC_AUTH_TOKEN /
// ANS_PI_CONTEXT_WINDOW），不打印、不落盘任何凭据值。
// 路径：真实 Pipeline openRoleSession → 真实 Service createRuntimeAdapter → 默认 Pi 工厂
// （createPiRuntimeAdapter）→ Pi SDK → 客户网关。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import type { OrchestrationEvent } from "../../../src/common/编排/handback.ts";
import type { ProjectConfig } from "../../../src/model/role.ts";

const SMOKE_TIMEOUT_MS = 180_000;

function makeProject(): { root: string; project: ProjectConfig; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-e2e-smoke-"));
  const dir = path.join(root, "角色卡", "smoke");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 smoke\n\n连通性冒烟测试角色。\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    ["role: smoke", "entries: []", ""].join("\n"),
  );
  return {
    root,
    project: {
      projectRoot: root,
      skillRoot: root,
      roles: { smoke: { card: "角色卡/smoke/role-card.md", boundary: "角色卡/smoke/boundary.yaml" } },
      builtInRoles: ["su"],
      governanceBoundary: {
        path: "角色卡/smoke/boundary.yaml",
        acceptance: { accepted: true, source: "test:e2e-smoke" },
      },
    },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const temp = makeProject();
  const events: OrchestrationEvent[] = [];
  let handle: Awaited<ReturnType<typeof openRoleSession>> | undefined;
  try {
    handle = await openRoleSession(
      {
        roleId: "smoke",
        runtime: "pi",
        project: temp.project,
        persistSession: false,
      },
      {
        runtimeOptions: {
          persistSession: false,
          constructTimeoutMs: 120_000,
          turnLastResortMs: SMOKE_TIMEOUT_MS,
        },
      },
    );

    const iterator = handle.events()[Symbol.asyncIterator]();
    let markSettled: (() => void) | undefined;
    const settledSeen = new Promise<void>((resolve) => { markSettled = resolve; });
    const pump = (async () => {
      for (;;) {
        const next = await iterator.next();
        if (next.done === true) return;
        events.push(next.value);
        if (next.value.kind === "settled") {
          markSettled?.();
          return;
        }
      }
    })();

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        void handle?.abort?.();
        reject(new Error(`连通性冒烟超时（${SMOKE_TIMEOUT_MS}ms）`));
      }, SMOKE_TIMEOUT_MS);
    });

    try {
      await Promise.race([handle.send("只回复 OK。不要调用任何工具。"), timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }

    // 等本轮 settled（send 返回后最多再给 2s 排空），随后停止事件泵。
    await Promise.race([
      settledSeen,
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    void iterator.return?.();
    await pump.catch(() => {});

    const messages = events.filter((event) => event.kind === "message").map((event) => event.summary);
    const settled = events.filter((event) => event.kind === "settled").map((event) => event.summary);
    const elapsed = Date.now() - startedAt;
    const reply = messages.join("\n");
    console.log("SMOKE_RESULT_BEGIN");
    console.log(JSON.stringify({
      ok: /ok/i.test(reply),
      elapsedMs: elapsed,
      eventKinds: events.map((event) => `${event.kind}:${event.summary.slice(0, 120)}`),
      messages,
      settled,
    }, null, 2));
    console.log("SMOKE_RESULT_END");
    if (!/ok/i.test(reply)) {
      console.error("冒烟失败：未在真实模型回复中看到 OK");
      process.exitCode = 2;
    }
  } finally {
    try {
      await handle?.dispose();
    } catch (error) {
      console.error("dispose 失败：", error instanceof Error ? error.message : String(error));
      process.exitCode = process.exitCode ?? 3;
    }
    temp.cleanup();
  }
}

main().catch((error) => {
  console.error("SMOKE_FATAL:", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exitCode = 1;
});
