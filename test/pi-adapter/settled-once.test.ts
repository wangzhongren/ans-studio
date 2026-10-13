// X-1：每轮 settle **恰发一次** `settled`——夹具驱动 A/B（修前 2 / 修后 1）+ 中止路径回归。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 包**（未安装则整组跳过）。
//
// 背景（真机已证）：适配器两个发射点同发 settled（扩展层 pi.on("agent_settled") + session.subscribe）
// ⇒ 每轮两份 ⇒ 编排每份发一次回交 ⇒ 去重键含毫秒时间戳 ⇒ 去重失效 ⇒ su 收到重复投递。
// 修复：删扩展层映射（保留其 tool_call 拦截等职责）；settle 的唯一发射点 = `wireSettledOnce`
//（导出的收口函数），保留在 `session.subscribe`（公开事件面、与事件源同层；扩展层是可缺席层，
// 而 settled 是消费方关键信号——漏发即挂起，不应挂在可选层）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGovernanceExtension, toPiTool, wireSettledOnce } from "../../src/common/pi-adapter/real-adapter.ts";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import { ANS_SETTINGS_OVERRIDES } from "../../src/common/pi-adapter/settings.ts";
import type { SessionEvent } from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

async function piInstalled(): Promise<boolean> {
  try {
    await import("@earendil-works/pi-coding-agent");
    return true;
  } catch {
    return false;
  }
}

function allowGate(): (p: string) => WriteDecision {
  return () => ({
    allowed: true,
    matchedEntry: { root: "project", path: "<any>", kind: "file", purpose: "test" },
  });
}

// —————————————————————— 1. wireSettledOnce（stub 会话） ——————————————————————

test("wireSettledOnce（stub）：同轮重复settle只发一次；新轮再发；退订生效", () => {
  const listeners = new Set<(e: { type: string }) => void>();
  const stub = {
    subscribe(listener: (e: { type: string }) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const events: SessionEvent[] = [];
  const unsubscribe = wireSettledOnce(stub, (e) => events.push(e));

  const fire = (type: string): void => {
    for (const l of [...listeners]) l({ type });
  };
  fire("message_end");
  fire("agent_settled");
  assert.equal(events.filter((e) => e.kind === "settled").length, 1, "一次 settle ⇒ 恰一个");
  assert.equal(events[0]!.summary, "会话结束");

  fire("agent_settled");
  assert.equal(events.filter((e) => e.kind === "settled").length, 1, "同轮重复settle不能重复终态");
  fire("agent_start");
  fire("agent_settled");
  assert.equal(events.filter((e) => e.kind === "settled").length, 2, "明确新轮再发终态");

  unsubscribe();
  fire("agent_settled");
  assert.equal(events.filter((e) => e.kind === "settled").length, 2, "退订后不再收");
  assert.equal(events.some((e) => e.kind !== "settled"), false);
});

// —————————————————————— 2. SDK 级 A/B（faux，离线） ——————————————————————

/** 造一轮真实 settle（faux 会话），返回本轮的 settled 计数与扩展 handlers。 */
async function runOneTurn(opts: {
  /** 扩展层是否含 agent_settled 映射（true = 修复前接线；false = 修复后）。 */
  extensionSettledMapping: boolean;
  /** 用出厂扩展（buildGovernanceExtension）还是最小复刻扩展。 */
  useShippedExtension: boolean;
  /** 中途中止（考验 abort 路径语义）。 */
  abortMidTurn?: boolean;
}): Promise<{ settledCount: number; extensionHandlerKeys: string[] }> {
  const dir = mkdtempSync(join(tmpdir(), "ans-x1-"));
  try {
    const settled: string[] = [];
    let extensionHandlerKeys: string[] = [];

    const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import(
      "@earendil-works/pi-coding-agent"
    );
    const { fauxProvider, fauxAssistantMessage, fauxToolCall, InMemoryCredentialStore } = await import(
      "@earendil-works/pi-ai"
    );

    const emit = (event: SessionEvent): void => {
      if (event.kind === "settled") settled.push("settled");
    };

    // 中止路径需要一个会「挂住」的工具（与 G-1 用例同法）。
    let startedResolve: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    let releaseConfirm: () => void = () => {};
    const confirmHolds = new Promise<void>((resolve) => {
      releaseConfirm = resolve;
    });

    const governed = buildGovernedTools(allowGate(), {
      readRoot: dir,
      writeRoot: dir,
      ...(opts.abortMidTurn
        ? {
            customerInput: async () => {
              startedResolve();
              await confirmHolds;
              return { outcome: "answered" as const, value: { confirmed: true } };
            },
          }
        : {}),
    }).map((tool) => toPiTool(tool as never));

    const shipped = buildGovernanceExtension(allowGate(), emit, false);
    const minimalFactory = (p: { on: (e: string, h: () => unknown) => void }): void => {
      p.on("tool_call", () => undefined);
      if (opts.extensionSettledMapping) {
        p.on("agent_settled", () => {
          settled.push("ext");
        });
      }
    };
    const extension = opts.useShippedExtension
      ? shipped
      : { name: "test-extension", factory: minimalFactory as never };

    const faux = fauxProvider();
    faux.setResponses(
      opts.abortMidTurn
        ? [
            fauxAssistantMessage([fauxToolCall("request_confirmation", { title: "等" })]),
            fauxAssistantMessage("收尾"),
          ]
        : [fauxAssistantMessage("ok")],
    );
    const runtime = await ModelRuntime.create({
      credentials: new InMemoryCredentialStore(),
      modelsPath: null,
      refreshOnCreate: false,
      allowModelNetwork: false,
    });
    runtime.registerNativeProvider(faux.provider);
    const model = runtime.getModel(faux.provider.id, faux.models[0].id);
    assert.ok(model != null);

    const settingsManager = SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);
    const resourceLoader = new DefaultResourceLoader({
      cwd: dir,
      agentDir: dir,
      extensionFactories: [extension as never],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      settingsManager,
    });
    await resourceLoader.reload();
    const { session, extensionsResult } = await createAgentSession({
      cwd: dir,
      noTools: "builtin",
      customTools: governed as never,
      resourceLoader,
      model: model as never,
      modelRuntime: runtime,
      sessionManager: SessionManager.inMemory(dir),
      settingsManager,
    });
    extensionHandlerKeys = [...(extensionsResult.extensions[0]?.handlers.keys() ?? [])];
    try {
      // 接线（修复后形态）：settle 唯一发射点。
      wireSettledOnce(session, emit);
      const prompting = session.prompt("x");
      if (opts.abortMidTurn === true) {
        await started;
        await session.abort();
        try {
          await prompting;
        } catch {
          // 中止属预期
        }
        await new Promise((resolve) => setTimeout(resolve, 150)); // 让 settle 事件落地
        releaseConfirm();
      } else {
        await prompting;
      }
    } finally {
      session.dispose();
    }
    return { settledCount: settled.length, extensionHandlerKeys };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("A 修复前接线（扩展含 agent_settled 映射 + subscribe）→ 一轮 **2** 个 settled（复现）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const r = await runOneTurn({ extensionSettledMapping: true, useShippedExtension: false });
  assert.equal(r.settledCount, 2, "双发射点应复现每轮两份");
});

test("B 修复后接线（**出厂扩展** + wireSettledOnce）→ 一轮 **恰 1** 个 settled；且扩展不含 agent_settled、仍含 tool_call", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const r = await runOneTurn({ extensionSettledMapping: false, useShippedExtension: true });
  assert.equal(r.settledCount, 1, "修复后每轮恰一个 settled");
  assert.equal(
    r.extensionHandlerKeys.includes("agent_settled"),
    false,
    "出厂扩展**不得**再注册 agent_settled（防重复发射点漂移回）",
  );
  assert.ok(r.extensionHandlerKeys.includes("tool_call"), "扩展的 tool_call 拦截必须保留");
});

test("中止路径回归：出厂接线下一轮 abort → 仍**恰 1** 个 settled（消费方不挂起）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const r = await runOneTurn({ extensionSettledMapping: false, useShippedExtension: true, abortMidTurn: true });
  assert.equal(r.settledCount, 1, "中止路径仍恰一个 settled（既有语义：不漏发）");
});
