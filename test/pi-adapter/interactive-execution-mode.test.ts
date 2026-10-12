// 实测：`executionMode:"sequential"`（设计 A-6）在**真实 Pi 链路**里是否生效。
// 归属：Pi适配器角色测试目录。**不静态 import Pi 包**（未安装则整组跳过，同 real-adapter.smoke 先例）。
//
// 背景（设计 A-6）：Pi **缺省同批并行**执行工具（`pi-agent-core agent.js:145` 缺省 "parallel"；
// `agent-loop.js:369`：`config.toolExecution === "sequential" || hasSequentialToolCall` 才走顺序路径）。
// 若确认（request_confirmation）与写盘（write_file）落在**同一条助手消息**里而并行执行，
// write_file 会**抢跑于确认**。故两交互工具都带 `executionMode:"sequential"`。
//
// 做法：**完全离线**——用 pi-ai 内置的 **faux provider**（`providers/faux.ts`，keyless、进程内流式）作
// 脚本化模型：一条助手消息**同批**发 request_confirmation + write_file 两个 tool call。
// 判据（时序证据）：
//   · sequential 生效 → write_file 的 handler（起点即调 gate）必须在确认**完成之后**才出现；
//   · 未生效（同批并行）→ write_file 与确认**并发**开始 → gate 出现在确认完成**之前**。
// 本用例同时验证整条链：我们的 ToolDefinition（`toPiTool` 带 executionMode）→ `createAgentSession`
// 的 customTools → SDK 注册包装（wrapRegisteredTools/wrapToolDefinition 透传 executionMode）→ agent-loop
// 的批执行决策；并顺带验证 promptGuidelines 能被 SDK 接受（注册不报错）。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildGovernedTools, REQUEST_CONFIRMATION_TOOL_NAME } from "../../src/provider/pi/tools.ts";
import { describeTool, toPiTool } from "../../src/common/pi-adapter/real-adapter.ts";
import { ANS_SETTINGS_OVERRIDES } from "../../src/common/pi-adapter/settings.ts";
import type { CustomerInputFn } from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";

async function piInstalled(): Promise<boolean> {
  try {
    await import("@earendil-works/pi-coding-agent");
    return true;
  } catch {
    return false;
  }
}

/** 一律放行的写门禁（记录被调用的时刻供时序断言）。 */
function recordingGate(events: string[]): (p: string) => WriteDecision {
  return (p: string): WriteDecision => {
    events.push(`gate(${p})`);
    return { allowed: true, matchedEntry: { root: "project", path: p, kind: "file", purpose: "test" } };
  };
}

// —————————————————————— 1.（不依赖 Pi）描述层：interactive 工具确带 sequential 与准则文案 ——————————————————————

test("describeTool：两交互工具带 executionMode:'sequential' 与 promptGuidelines；其余工具不带", () => {
  for (const name of [REQUEST_CONFIRMATION_TOOL_NAME, "request_choice"]) {
    const d = describeTool(name);
    assert.equal(d.executionMode, "sequential", `${name} 必须钉 sequential（A-6）`);
    assert.ok(Array.isArray(d.promptGuidelines) && d.promptGuidelines.length > 0, `${name} 应有 promptGuidelines（A-2）`);
    assert.match(d.promptGuidelines!.join("\n"), /写盘/, "准则应写死「写盘」纪律（A-2）");
    assert.match(d.promptGuidelines!.join("\n"), /未获|不要|不得/, "准则应含未获同意时的禁令（A-2）");
  }
  for (const name of ["write_file", "read_file", "run_shell"]) {
    assert.equal(describeTool(name).executionMode, undefined, `${name} 不应擅自改执行模式`);
  }
});

test("describeTool 文案（A-3 配合）：两工具都要求 preview 列出将写出的具体路径，且列路径≠获准", () => {
  const confirm = describeTool(REQUEST_CONFIRMATION_TOOL_NAME);
  const confirmText = [confirm.description, ...(confirm.promptGuidelines ?? [])].join("\n");
  // 硬要求：preview 必须列出将写出的具体路径（编排发行器从 preview 提取路径发行；未列 ⇒ F4 拒）。
  assert.match(confirmText, /必须列出.*路径/, "确认工具应写死「preview 必须列出具体路径」");
  assert.match(confirmText, /未列出的路径/, "应说明未列路径的后果（不发行 → 被门禁拒绝）");
  // 不得让模型以为「列了路径=获准」。
  assert.match(confirmText, /不等于/, "应明示列出路径 ≠ 获准");
  assert.match(confirmText, /confirmed:true/, "获准的唯一凭据应是 confirmed:true");

  const choice = describeTool("request_choice");
  const choiceText = [choice.description, ...(choice.promptGuidelines ?? [])].join("\n");
  assert.match(choiceText, /必须列出.*路径|列出具体路径/, "选择工具同样要求 preview 列路径");
  assert.match(choiceText, /选择≠写盘同意|不构成写盘同意/, "应明示选择 ≠ 写盘同意（choice 不发行写盘许可）");
  assert.match(choiceText, /confirmed:true/, "写盘仍只认 request_confirmation 的 confirmed:true");

  // 防线回顾：不得出现「列了路径即可写」这类反向措辞。
  assert.equal(/列出路径.*(即可|就可|便能)写/.test(confirmText + choiceText), false);
});

test("describeTool：request_confirmation 的 schema 含 title 必填与 preview；request_choice 含 options 必填", () => {
  const confirm = describeTool(REQUEST_CONFIRMATION_TOOL_NAME);
  assert.deepEqual(confirm.parameters.required, ["title"]);
  const props = confirm.parameters.properties as Record<string, unknown>;
  assert.ok(props["preview"], "应支持 preview（角色卡+边界摘要预览）");

  const choice = describeTool("request_choice");
  assert.deepEqual(choice.parameters.required, ["title", "options"]);
});

// —————————————————————— 2.（真实链路，离线）同批 confirm+write 的顺序实测 ——————————————————————

/**
 * 在真实 `createAgentSession` 链路上跑「同批 confirm + write」并回传时序事件。
 * `stripExecutionMode: true` 为**对照组**：从自定义工具定义上抹掉 `executionMode`（其余不变）——
 * 若对照组里 write_file **抢跑**（gate 出现在确认完成之前），即证明该字段是**承重**的。
 */
async function runBatchOrderProbe(stripExecutionMode: boolean): Promise<{ events: string[]; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), "ans-pi-seq-"));
  const events: string[] = [];

  // 确认通道：记录开始/结束；120ms 后同意——若 write_file 与它并行，gate 会抢在确认完成之前。
  const customerInput: CustomerInputFn = async () => {
    events.push("confirm:start");
    await new Promise((resolve) => setTimeout(resolve, 120));
    events.push("confirm:end");
    return { outcome: "answered", value: { confirmed: true }, operatorId: "tester" };
  };

  const governed = buildGovernedTools(recordingGate(events), {
    readRoot: dir,
    writeRoot: dir,
    customerInput,
    customerInputTimeoutMs: 5000,
  });
  const customTools = governed.map((tool) => {
    const piTool = toPiTool(tool as never) as unknown as Record<string, unknown>;
    if (stripExecutionMode) delete piTool["executionMode"];
    return piTool;
  });

  const { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, ModelRuntime } = await import(
    "@earendil-works/pi-coding-agent"
  );
  const { fauxProvider, fauxAssistantMessage, fauxToolCall, InMemoryCredentialStore } = await import(
    "@earendil-works/pi-ai"
  );

  const faux = fauxProvider();
  faux.setResponses([
    // 第一条助手消息：**同批**发出确认（预览角色卡）与写角色卡。
    fauxAssistantMessage([
      fauxToolCall(REQUEST_CONFIRMATION_TOOL_NAME, { title: "预览角色卡", preview: "# 角色卡全文" }),
      fauxToolCall("write_file", { path: "role.md", content: "# 角色卡\n" }),
    ]),
    fauxAssistantMessage("完成"),
  ]);

  const runtime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
    refreshOnCreate: false,
    allowModelNetwork: false,
  });
  runtime.registerNativeProvider(faux.provider);
  const model = runtime.getModel(faux.provider.id, faux.models[0].id);
  assert.ok(model, "faux 模型应可解析");

  const settingsManager = SettingsManager.inMemory(ANS_SETTINGS_OVERRIDES);
  const resourceLoader = new DefaultResourceLoader({
    cwd: dir,
    agentDir: dir,
    extensionFactories: [],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    settingsManager,
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: dir,
    noTools: "builtin",
    customTools: customTools as never,
    resourceLoader,
    model: model as never,
    modelRuntime: runtime,
    sessionManager: SessionManager.inMemory(dir),
    settingsManager,
  });
  try {
    await session.prompt("请先向客户预览角色卡，再写入。");
  } finally {
    session.dispose();
  }
  return { events, dir };
}

test("实测（faux provider，离线）：同批 request_confirmation + write_file 时，write_file 在确认完成之后才执行", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const { events, dir } = await runBatchOrderProbe(false);
  try {
    // —— 时序断言（核心实测结论）——
    const iConfirmEnd = events.indexOf("confirm:end");
    const iGate = events.findIndex((e) => e.startsWith("gate("));
    assert.ok(iConfirmEnd >= 0, `确认应走完等待：${events.join(" > ")}`);
    assert.ok(iGate >= 0, `write_file 应执行到 gate：${events.join(" > ")}`);
    assert.ok(
      iGate > iConfirmEnd,
      `executionMode:"sequential" 生效时 write_file 必须在确认完成之后才开始；实测顺序：${events.join(" > ")}`,
    );
    // 确认之后确实落盘（同一临时目录，链路完整）。
    assert.equal(readFileSync(join(dir, "role.md"), "utf8"), "# 角色卡\n");
    t.diagnostic(`实测顺序：${events.join(" > ")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("对照组（抹掉 executionMode）：write_file 抢跑于确认——证明该字段承重，不是环境巧合", async (t) => {
  if (!(await piInstalled())) {
    t.skip("未安装 @earendil-works/pi-coding-agent");
    return;
  }
  const { events, dir } = await runBatchOrderProbe(true);
  try {
    const iConfirmEnd = events.indexOf("confirm:end");
    const iGate = events.findIndex((e) => e.startsWith("gate("));
    assert.ok(iConfirmEnd >= 0 && iGate >= 0, `对照组两事件都应发生：${events.join(" > ")}`);
    assert.ok(
      iGate < iConfirmEnd,
      `对照组应复现「同批并行、write_file 抢跑」（gate 先于确认完成）；实测顺序：${events.join(" > ")}。` +
        `若本断言失败，说明该 SDK 版本同批本就顺序执行——executionMode 无坏处，但「抢跑风险」的结论需改写。`,
    );
    t.diagnostic(`对照组实测顺序：${events.join(" > ")}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
