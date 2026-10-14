// 会话提示降噪：常规会话行只在终端被降为 trace、恢复提示**聊天流也不出现**（客户 2026-10-12 二次裁定）；
// 异常/一次性行（skip/note）仍如实告知（stage + 事件流，不静默）。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 包**（未安装则整组跳过；logger 门槛用例无需 Pi）。
//
// 覆盖：
//   1. 真 logger 门槛：默认（无 `ANS_PI_TRACE`）stage 打印、trace **不**打印；开 trace 后 trace 打印；
//   2. 真 bindRole（离线构造）：**新会话**与**会话恢复**两条提示走 `log.trace`、**不走** `log.stage`；
//      且**事件流不含恢复提示**（客户二次裁定：聊天流也不要；原断言「事件流应保留」已按裁定反转）；
//   3. 异常/一次性行不降噪：全污染 note 走 `log.stage` + 事件流；**resumed + 跳过污染档**（该路径 note
//      为 undefined，skip 事实此前只在被删的恢复提示里）也走 `log.stage` + 事件流——不静默吞异常事实。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createRealPiRuntimeAdapter } from "../../src/common/pi-adapter/real-adapter.ts";
import { createStageLogger, type StageLogger } from "../../src/common/pi-adapter/logger.ts";
import { buildGovernedTools } from "../../src/provider/pi/tools.ts";
import { createInteractionGate } from "../../src/common/pi-adapter/timeout.ts";
import { makeGate, makeRole } from "./fixtures.ts";

async function piInstalled(): Promise<boolean> {
  try {
    await import("@earendil-works/pi-coding-agent");
    return true;
  } catch {
    return false;
  }
}

// 构造层需要凭据**存在**（只查存在性）：placeholder（与 smoke 先例一致）。
if (!process.env.ANTHROPIC_AUTH_TOKEN) {
  process.env.ANTHROPIC_AUTH_TOKEN = "log-noise-test-placeholder-token";
}

/** 记录各通道消息的替身 logger。 */
function spyLogger(): { logger: StageLogger; stages: string[]; traces: string[] } {
  const box = { stages: [] as string[], traces: [] as string[], logger: undefined as unknown as StageLogger };
  box.logger = {
    stage: (m) => box.stages.push(m),
    trace: (m) => box.traces.push(m),
    traceEnabled: true,
  };
  return box as unknown as { logger: StageLogger; stages: string[]; traces: string[] };
}

function makeAdapter(opts: { projectRoot: string; sessionDir: string; logger: StageLogger }) {
  return createRealPiRuntimeAdapter({
    runtime: "pi",
    tools: buildGovernedTools(makeGate({ skill: ["技能/示例/"], project: ["src/provider/pi/tools.ts"] })),
    interactionGate: createInteractionGate(),
    currentTurnId: () => undefined,
    projectRoot: opts.projectRoot,
    skillRoot: opts.projectRoot,
    sessionDir: opts.sessionDir,
    logger: opts.logger,
    providerId: "ans-gateway",
    baseUrl: "https://log-noise.example.invalid/anthropic/",
    modelId: "gw-model-x",
    contextWindow: 32768,
    apiKeyEnvVar: "ANTHROPIC_AUTH_TOKEN",
  });
}

/**
 * 排空事件流（**先 dispose 再迭代**）：`dispose` 已 `queue.close()`，迭代器会先送出全部已缓冲事件、
 * 随后正常结束——无需按事件条数提前 break，也就不会因「一条事件都没有」而挂起等待。
 */
async function drainEventSummaries(session: { events(): AsyncIterable<{ kind: string; summary: string }> }): Promise<string[]> {
  const events: string[] = [];
  for await (const event of session.events()) {
    events.push(`${event.kind}:${event.summary}`);
  }
  return events;
}

// —————————————————————— 1. logger 门槛（真 logger） ——————————————————————

test("真 logger 门槛：默认 stage 打印、trace 不打印；ANS_PI_TRACE=1 时 trace 打印", () => {
  const captured: string[] = [];
  const original = process.stderr.write.bind(process.stderr);
  (process.stderr as { write: unknown }).write = (chunk: unknown): boolean => {
    captured.push(String(chunk));
    return true;
  };
  try {
    const quiet = createStageLogger({});
    quiet.stage("阶段行");
    quiet.trace("细节行");
    assert.ok(captured.some((l) => l.includes("阶段行")), "默认 stage 应打印");
    assert.equal(captured.some((l) => l.includes("细节行")), false, "默认 trace **不**打印（降噪的机制基础）");

    const verbose = createStageLogger({ ANS_PI_TRACE: "1" });
    verbose.trace("细节行-开");
    assert.ok(captured.some((l) => l.includes("细节行-开")), "开 trace 后 trace 应打印");
  } finally {
    (process.stderr as { write: unknown }).write = original;
  }
});

// —————————————————————— 2. 真 bindRole：两条常规行降噪、恢复提示聊天流也不出现 ——————————————————————

test("新会话：提示走 log.trace、不走 log.stage（默认终端不出现该行）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "ans-log-noise-"));
  try {
    const s = spyLogger();
    const adapter = makeAdapter({ projectRoot: root, sessionDir: join(root, ".ans", "sessions", "r"), logger: s.logger });
    const session = await adapter.bindRole(makeRole());
    await session.dispose();

    assert.ok(s.traces.some((m) => m.includes("新会话（持久化目录")), `应有 trace：${JSON.stringify(s.traces)}`);
    assert.equal(
      s.stages.some((m) => m.includes("新会话（持久化目录")),
      false,
      "新会话提示不得走 stage（默认终端不出现）",
    );
    // 其余 stage 行不受扰（如「bindRole 完成」仍应存在）。
    assert.ok(s.stages.some((m) => m.includes("bindRole 完成")), "常规阶段行仍走 stage");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("会话恢复：提示走 log.trace、不走 log.stage；**事件流不含**恢复提示（客户二次裁定，原保留决定已推翻）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "ans-log-noise-"));
  try {
    const sessionDir = join(root, ".ans", "sessions", "r");
    // 预置一个「有对话」的会话文件（恢复的判据是 list 有内容 → mode=resumed），且**无**污染档：
    // 这条走常规恢复路径（note 为 undefined、skippedContaminated 为 undefined）。
    const pi = await import("@earendil-works/pi-coding-agent");
    const seed = pi.SessionManager.create(root, sessionDir);
    seed.appendMessage({ role: "user", content: "旧会话内容", timestamp: Date.now() });

    const s = spyLogger();
    const adapter = makeAdapter({ projectRoot: root, sessionDir, logger: s.logger });
    const session = await adapter.bindRole(makeRole());
    await session.dispose();

    // 先 dispose（已 close 队列）再排空：无事件时迭代也会正常结束，不会挂起等待。
    const events = await drainEventSummaries(session);

    assert.equal(
      events.some((e) => e.includes("会话已恢复")),
      false,
      `事件流不得含恢复提示（客户二次裁定：聊天流也不要）：${events.join(" | ")}`,
    );
    assert.ok(s.traces.some((m) => m.includes("会话已恢复：")), `trace 仍应有（ANS_PI_TRACE 可查）：${JSON.stringify(s.traces)}`);
    assert.equal(
      s.stages.some((m) => m.includes("会话已恢复：")),
      false,
      "会话恢复提示不得走 stage（默认终端不出现）",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// —————————————————————— 3. 异常/一次性行不降噪（如实告知，不静默） ——————————————————————

test("异常行不降噪：全污染 ⇒ note 仍走 log.stage 与事件流（跳过恢复并新建）", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "ans-log-noise-"));
  try {
    const sessionDir = join(root, ".ans", "sessions", "r");
    mkdirSync(sessionDir, { recursive: true });
    // 合成一个「含字面 tool_removal 块」的污染会话文件（全污染 ⇒ note 路径）。
    const header = { type: "session", version: 3, id: "bad", timestamp: new Date().toISOString(), cwd: root };
    const badEntry = {
      type: "message",
      id: "e1",
      parentId: null,
      timestamp: new Date().toISOString(),
      message: { role: "system", content: [{ type: "tool_removal", tool: { type: "tool_reference", name: "t" } }], timestamp: Date.now() },
    };
    writeFileSync(join(sessionDir, "bad.jsonl"), `${JSON.stringify(header)}\n${JSON.stringify(badEntry)}\n`, "utf8");

    const s = spyLogger();
    const adapter = makeAdapter({ projectRoot: root, sessionDir, logger: s.logger });
    const session = await adapter.bindRole(makeRole());
    await session.dispose();

    assert.ok(
      s.stages.some((m) => m.includes("跳过恢复并新建")),
      `异常行应仍走 stage：${JSON.stringify(s.stages)}`,
    );
    const events = await drainEventSummaries(session);
    assert.ok(
      events.some((e) => e.includes("跳过恢复并新建")),
      `异常事实应仍进事件流（如实告知，不静默）：${events.join(" | ")}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("异常行不降噪：恢复时跳过污染档（note 为 undefined）也如实告知——stage + 事件流；恢复本身仍不上聊天流", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const root = mkdtempSync(join(tmpdir(), "ans-log-noise-"));
  try {
    const sessionDir = join(root, ".ans", "sessions", "r");
    // 干净旧档：message.timestamp 取较早（list 的 modified 优先取消息时间）——它会被恢复。
    const pi = await import("@earendil-works/pi-coding-agent");
    const seed = pi.SessionManager.create(root, sessionDir);
    seed.appendMessage({ role: "user", content: "干净旧会话", timestamp: Date.now() - 60_000 });
    mkdirSync(sessionDir, { recursive: true });
    // 污染档：system 消息不参与 modified 计算 ⇒ 回落 header.timestamp（较新）——list 排序在前、被跳过；
    // 干净档排在它之后 ⇒ mode=resumed 且 skippedContaminated=1（note 为 undefined 的组合路径）。
    const header = { type: "session", version: 3, id: "bad", timestamp: new Date().toISOString(), cwd: root };
    const badEntry = {
      type: "message",
      id: "e1",
      parentId: null,
      timestamp: new Date().toISOString(),
      message: { role: "system", content: [{ type: "tool_removal", tool: { type: "tool_reference", name: "t" } }], timestamp: Date.now() },
    };
    writeFileSync(join(sessionDir, "bad.jsonl"), `${JSON.stringify(header)}\n${JSON.stringify(badEntry)}\n`, "utf8");

    const s = spyLogger();
    const adapter = makeAdapter({ projectRoot: root, sessionDir, logger: s.logger });
    const session = await adapter.bindRole(makeRole());
    await session.dispose();

    assert.ok(
      s.stages.some((m) => m.includes("含网关不认识的工具变更块") && m.includes("已跳过")),
      `跳过事实应走 stage（异常行不降噪）：${JSON.stringify(s.stages)}`,
    );
    assert.ok(s.traces.some((m) => m.includes("会话已恢复：")), `trace 仍应有恢复行：${JSON.stringify(s.traces)}`);

    const events = await drainEventSummaries(session);
    assert.ok(
      events.some((e) => e.includes("含网关不认识的工具变更块")),
      `跳过事实应进事件流（异常事实不得静默吞掉）：${events.join(" | ")}`,
    );
    assert.equal(
      events.some((e) => e.startsWith("message:会话已恢复：")),
      false,
      `事件流不得含常规恢复提示：${events.join(" | ")}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
