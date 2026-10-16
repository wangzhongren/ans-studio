// 服务端工具族（web_search / web_fetch / code_execution）live 探针 —— **由客户在验证阶段运行**。
// 归属：Pi适配器角色测试目录。本脚本直发真实网关请求（含服务端工具声明），**不是**自动化测试——
// `test/pi-adapter/**/*.test.ts` 的 glob 不会选中本文件。
//
// 用法（在仓库根目录；Node >= 23.6 直接跑 TS）：
//   node test/pi-adapter/server-tools-probe.ts [baseUrl] [model]      # 真实探测（客户运行）
//   node test/pi-adapter/server-tools-probe.ts --self-test            # 离线自检（本地回环、不发任何真实请求）
//   —— baseUrl/model 缺省读仓库 `.env`（ANS_PI_BASE_URL / ANS_PI_MODEL；loadEnvFileInto，**只打印键名、
//      绝不打印凭据值**）；凭据读 ANTHROPIC_AUTH_TOKEN（只用作请求头，绝不出现在任何输出）。
//
// 分项（对应提案 §五.9；输出为**结构化摘要——不含查询串/正文，仅形状与计数**，由 PM 转达）：
//   ① 逐工具一次性声明请求（web_search / web_fetch / code_execution 各自 200/4xx）；
//   ② 两轮复放（本修复轮重构，见下）；③ max_uses 上限形状；④ usage.server_tool_use 计量回传；
//   ⑤ 观察项：stop_reason=pause_turn 等异常收尾（见到即报，未见到如实记「未见」）。
//
// ── 修复轮记录（2026-10-16，客户首批探针结果评估后的最小修复）──
// 首批 round2 的 500（`messages.1: all messages must have non-empty content`）判定为**探针构造产物**，
// 两处偏差已修：
//   ① 流式文本未捕获：旧逻辑对「start 空文本 + text_delta 增量」的标准形态全丢（旧 :124/:128-129）。
//      现改为**按 content_block index 关联**缓冲（text / thinking / signature 三类 delta 都按 index 累计）。
//   ② 空捕获直发 `{role:"assistant",content:[]}`：真实链路不会发送空内容助手消息——pi-ai `convertMessages`
//      对「转换后空内容」的助手消息**整条跳过**（dist `anthropic-messages.js:1145-1146`）。现改为按 pi-ai
//      的**回放语义**构造 ②-a（text 非空才回放；thinking 有签名回放 thinking、无签名转 text；全空跳过），
//      空回放时**不发 assistant 消息**（该形态由 ②-b 精确覆盖）。
// ② 两段（都有如实判读输出）：
//   · ②-a 剥离转录复放：[user1, assistant(pi-ai 回放块), user2] —— 真实「带工具结果的多轮往返」形态；
//   · ②-b 相邻 user 消息：[user1, user2] —— 真实「助手消息剥离后全空 ⇒ 被整条省略」的精确回放形态。
// 判读口径（组合）：
//   · ②-a 接受 ⇒ 剥离转录可接受（②-b 仅补强）；②-a 拒 ⇒ 真实风险成立、启动方案 P 评估（提案 §4.5-1）；
//   · ②-a 拒且 replayShape 含「thinking(签名回放)」⇒ 建议补一次「纯 text 复放」以区分 thinking 签名问题；
//   · ②-b 拒 ⇒ 「整条省略 ⇒ 相邻 user」形态有风险（须在降级/呈现面处置）。
//
// code_execution 仅作**探针声明**（产品注册表未列它——客户批准口径「缓」；首批探针结果＝网关 unknown
// variant、维持缓）；本网关仅支持 web_search_20250305/20260209（首批准入探针结论）。
//
// 安全纪律：只向 baseUrl 发请求（--self-test 只向 127.0.0.1 回环）；不落盘任何文件；输出里凡我们发送过的
// 提示词串一律 scrub 为 [SCRUBBED]；错误消息截断到 300 字符且经同样 scrub（**错误类别是诊断必需**）。

import { createServer } from "node:http";
import { loadEnvFileInto } from "../../src/common/shared/env-file.ts";
import { SERVER_TOOL_REGISTRY } from "../../src/common/pi-adapter/server-tools.ts";

/** 离线自检模式：本地回环仿真网关，不发任何真实请求（证明修复后的捕获/回放构造正确）。 */
const SELF_TEST = process.argv.includes("--self-test");

// —— 配置解析（自检模式跳过 .env，用占位值；真实模式逐字沿用原路径） ——
let baseUrl: string;
let model: string;
let token: string;
let endpoint: string;
if (SELF_TEST) {
  baseUrl = "self-test"; // 实际端点由 runSelfTest 起本地回环后覆盖
  model = "self-test-model";
  token = "self-test-placeholder-not-real"; // 仅作请求头发往本地回环；非真实凭据
  endpoint = "";
} else {
  const env: Record<string, string | undefined> = { ...process.env };
  const loaded = await loadEnvFileInto(env, ".env");
  console.log(`[probe] .env 读取：${loaded.path}；应用的键名（不含值）：${loaded.applied.join(", ") || "（无）"}`);
  baseUrl = (process.argv[2] ?? env["ANS_PI_BASE_URL"] ?? "").trim();
  model = (process.argv[3] ?? env["ANS_PI_MODEL"] ?? "").trim();
  token = env["ANTHROPIC_AUTH_TOKEN"] ?? "";
  if (baseUrl === "" || model === "" || token === "") {
    console.error("[probe] 缺少 baseUrl / model / ANTHROPIC_AUTH_TOKEN（args 或 .env），未发任何请求。用法：node test/pi-adapter/server-tools-probe.ts [baseUrl] [model]");
    process.exit(1);
  }
  endpoint = new URL("v1/messages", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

/** 探针声明的三条工具（前两条与产品注册表一致；code_execution 为探针专用、以追加探针结果定夺）。 */
const PROBE_TOOLS = [
  { id: "web_search", type: SERVER_TOOL_REGISTRY.find((entry) => entry.id === "web_search")!.type, prompt: "请用 web_search 搜索「ans-runtime server tools probe」并告诉我结果条数。" },
  { id: "web_fetch", type: SERVER_TOOL_REGISTRY.find((entry) => entry.id === "web_fetch")!.type, prompt: "请用 web_fetch 抓取 https://example.com 并告诉我页面标题。" },
  { id: "code_execution", type: "code_execution_20250825", prompt: "请用代码执行计算 1234*5678 并给出结果数字。" },
] as const;

const SEARCH_ALPHA = "ans-runtime server tools probe";
const SEARCH_BETA = "server tools second round probe";
const promptsSent = [PROBE_TOOLS[0].prompt, PROBE_TOOLS[1].prompt, PROBE_TOOLS[2].prompt, SEARCH_ALPHA, SEARCH_BETA];

const scrub = (text: string): string => {
  let out = text;
  for (const piece of promptsSent) out = out.replaceAll(piece, "[SCRUBBED]");
  return out.slice(0, 300);
};

interface ProbeSummary {
  status: number | string;
  contentType?: string;
  state: "ok" | "http-error" | "network-error";
  blocks?: string[];
  resultErrors?: string[];
  stopReason?: string;
  usageServerTools?: Record<string, number>;
  errorCategory?: string;
  errorMessageScrubbed?: string;
}

interface ProbeResult {
  summary: ProbeSummary;
  /** 按 pi-ai 回放语义构造的助手回放块（text 非空才回放；thinking 有签名回放 thinking、无签名转 text；全空跳过）。 */
  replayBlocks: unknown[];
  /** 回放块形状标签（判读用；只含形状词，不含正文）。 */
  replayShape: string[];
}

/** 发一条请求并归出「形状与计数」摘要 + pi-ai 回放块（流式/非流式两种响应都能解析）。 */
async function probeOnce(label: string, tools: unknown[], messages: unknown[]): Promise<ProbeResult> {
  const empty: ProbeResult = { summary: { status: "n/a", state: "network-error" }, replayBlocks: [], replayShape: [] };
  // —— 按 content_block index 关联的累积缓冲（修复 ①：流式 text/thinking/signature 都按 index 累计） ——
  const textByIndex = new Map<number, string>();
  const thinkingByIndex = new Map<number, { text: string; signature: string }>();
  const redactedByIndex = new Map<number, string>();
  const replayOrder: { index: number; kind: "text" | "thinking" | "redacted" }[] = [];
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}`, "anthropic-version": "2023-06-01", accept: "text/event-stream, application/json" },
      body: JSON.stringify({ model, max_tokens: 512, stream: true, tools, messages }),
      signal: AbortSignal.timeout(120_000),
    });
    const summary: ProbeSummary = { status: response.status, contentType: response.headers.get("content-type") ?? undefined, state: "network-error" };
    const text = await response.text();
    if (response.status >= 400) {
      summary.state = "http-error";
      try {
        const body = JSON.parse(text) as { error?: { type?: string; message?: string } };
        summary.errorCategory = body.error?.type ?? "unknown";
        summary.errorMessageScrubbed = scrub(body.error?.message ?? "");
      } catch {
        summary.errorMessageScrubbed = scrub(text);
      }
      return { summary, replayBlocks: [], replayShape: [] };
    }
    const events: Record<string, unknown>[] = [];
    if ((summary.contentType ?? "").includes("text/event-stream") || text.startsWith("event:")) {
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        try {
          events.push(JSON.parse(trimmed.slice(5).trim()) as Record<string, unknown>);
        } catch { /* 非 JSON 的 data 行忽略 */ }
      }
    } else {
      const body = JSON.parse(text) as { content?: unknown[]; stop_reason?: string; usage?: Record<string, unknown> };
      (body.content ?? []).forEach((block, index) => events.push({ type: "content_block_start", index, content_block: block }));
      events.push({ type: "message_delta", delta: { stop_reason: body.stop_reason }, usage: body.usage });
    }
    const blocks: string[] = [];
    const resultErrors: string[] = [];
    for (const event of events) {
      const type = String(event["type"]);
      const index = typeof event["index"] === "number" ? (event["index"] as number) : -1;
      if (type === "content_block_start") {
        const block = (event["content_block"] ?? {}) as Record<string, unknown>;
        const blockType = String(block["type"] ?? "?");
        if (blockType === "server_tool_use") blocks.push(`server_tool_use(${String(block["name"] ?? "?")})`);
        else if (blockType.endsWith("_tool_result")) {
          const content = block["content"];
          if (Array.isArray(content)) blocks.push(`${blockType}[${content.length}]`);
          else {
            blocks.push(blockType);
            const errorCode = (content as Record<string, unknown> | null)?.["error_code"];
            if (typeof errorCode === "string") resultErrors.push(errorCode.toUpperCase());
          }
        } else if (blockType === "text") {
          blocks.push("text");
          textByIndex.set(index, typeof block["text"] === "string" ? block["text"] : "");
          replayOrder.push({ index, kind: "text" });
        } else if (blockType === "thinking") {
          blocks.push("thinking");
          thinkingByIndex.set(index, { text: typeof block["thinking"] === "string" ? block["thinking"] : "", signature: typeof block["signature"] === "string" ? block["signature"] : "" });
          replayOrder.push({ index, kind: "thinking" });
        } else if (blockType === "redacted_thinking") {
          blocks.push("redacted_thinking");
          redactedByIndex.set(index, typeof block["data"] === "string" ? block["data"] : "");
          replayOrder.push({ index, kind: "redacted" });
        } else blocks.push(blockType);
      } else if (type === "content_block_delta") {
        const delta = (event["delta"] ?? {}) as Record<string, unknown>;
        const deltaType = String(delta["type"]);
        if (deltaType === "text_delta" && typeof delta["text"] === "string" && textByIndex.has(index)) {
          textByIndex.set(index, (textByIndex.get(index) ?? "") + delta["text"]);
        } else if (deltaType === "thinking_delta" && typeof delta["thinking"] === "string") {
          const item = thinkingByIndex.get(index);
          if (item !== undefined) item.text += delta["thinking"];
        } else if (deltaType === "signature_delta" && typeof delta["signature"] === "string") {
          const item = thinkingByIndex.get(index);
          if (item !== undefined) item.signature += delta["signature"];
        }
      } else if (type === "message_delta") {
        const stopReason = ((event["delta"] ?? {}) as Record<string, unknown>)["stop_reason"];
        if (typeof stopReason === "string") summary.stopReason = stopReason;
        collectUsage(summary, event["usage"]);
      } else if (type === "message_start") {
        collectUsage(summary, ((event["message"] ?? {}) as Record<string, unknown>)["usage"]);
      }
    }
    summary.blocks = blocks;
    summary.resultErrors = resultErrors;
    summary.state = "ok";
    // —— 按 pi-ai convertMessages 回放语义构造回放块（修复 ②：全空跳过、绝不产生空内容助手消息） ——
    const replayBlocks: unknown[] = [];
    const replayShape: string[] = [];
    for (const entry of replayOrder) {
      if (entry.kind === "text") {
        const raw = textByIndex.get(entry.index) ?? "";
        if (raw.trim() === "") continue; // pi-ai：空白 text 跳过
        replayBlocks.push({ type: "text", text: raw });
        replayShape.push("text");
      } else if (entry.kind === "thinking") {
        const item = thinkingByIndex.get(entry.index);
        const thinking = item?.text ?? "";
        const signature = item?.signature ?? "";
        if (thinking.trim() === "" && signature.trim() === "") continue; // pi-ai：全空跳过
        if (signature.trim() !== "") {
          replayBlocks.push({ type: "thinking", thinking, signature });
          replayShape.push("thinking(签名回放)");
        } else {
          replayBlocks.push({ type: "text", text: thinking }); // pi-ai：无签名 thinking 转 text
          replayShape.push("thinking→text(无签名)");
        }
      } else {
        const data = redactedByIndex.get(entry.index) ?? "";
        if (data !== "") {
          replayBlocks.push({ type: "redacted_thinking", data });
          replayShape.push("redacted_thinking");
        }
      }
    }
    return { summary, replayBlocks, replayShape };
  } catch (error) {
    const summary: ProbeSummary = { status: "n/a", state: "network-error", errorCategory: error instanceof Error ? error.name : "unknown", errorMessageScrubbed: scrub(error instanceof Error ? error.message : String(error)) };
    return { ...empty, summary };
  }
}

function collectUsage(summary: ProbeSummary, usage: unknown): void {
  const serverToolUse = usage !== null && typeof usage === "object" ? (usage as Record<string, unknown>)["server_tool_use"] : undefined;
  if (serverToolUse === null || typeof serverToolUse !== "object") return;
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(serverToolUse as Record<string, unknown>)) if (typeof value === "number") counts[key] = value;
  if (Object.keys(counts).length > 0) summary.usageServerTools = counts;
}

const replayTools = [{ type: PROBE_TOOLS[0].type, name: PROBE_TOOLS[0].id, max_uses: 1 }];
const round1Messages = [{ role: "user", content: `请用 web_search 搜索「${SEARCH_ALPHA}」，然后回答。` }];
const followupMessages = [
  { role: "user", content: `请用 web_search 搜索「${SEARCH_ALPHA}」，然后回答。` },
  { role: "user", content: `请再用 web_search 搜索「${SEARCH_BETA}」，然后回答。` },
];

/** §② 两轮复放（真实路径与自检共用）：②-a 剥离转录复放；②-b 相邻 user 消息形态。 */
async function runReplayProbes(): Promise<{ part: Record<string, unknown>; round1: ProbeSummary; round2a?: ProbeSummary; round2b: ProbeSummary }> {
  const round1 = await probeOnce("replay-r1", replayTools, round1Messages);
  const part: Record<string, unknown> = { round1: round1.summary, replayShape: round1.replayShape };
  let round2a: ProbeSummary | undefined;
  if (round1.replayBlocks.length > 0) {
    const probe = await probeOnce("replay-2a", replayTools, [
      { role: "user", content: `请用 web_search 搜索「${SEARCH_ALPHA}」，然后回答。` },
      { role: "assistant", content: round1.replayBlocks },
      { role: "user", content: `请再用 web_search 搜索「${SEARCH_BETA}」，然后回答。` },
    ]);
    round2a = probe.summary;
    part["round2a"] = probe.summary;
    part["verdict2a"] = probe.summary.state === "ok"
      ? "网关接受剥离转录（200）——真实两轮复放可接受"
      : `网关拒绝剥离转录（${String(probe.summary.status)}）——启动方案 P 评估（提案 §4.5-1）`;
  } else {
    part["verdict2a"] = "round1 无可回放块（text/thinking 均空）——剥离转录复放不可构造，由 ②-b 覆盖";
  }
  // ②-b：相邻 user 消息——真实链路「助手消息剥离后全空 ⇒ convertMessages 整条跳过」的精确回放形态。
  const probe2b = await probeOnce("replay-2b", replayTools, followupMessages);
  part["round2b"] = probe2b.summary;
  part["verdict2b"] = probe2b.summary.state === "ok"
    ? "网关接受相邻 user 消息（200）——「剥离后为空 ⇒ 整条省略」形态安全"
    : `网关拒绝相邻 user 消息（${String(probe2b.summary.status)}）——整条省略形态有风险（须在降级/呈现面处置）`;
  return { part, round1: round1.summary, ...(round2a !== undefined ? { round2a } : {}), round2b: probe2b.summary };
}

// —————————————————————— 离线自检（--self-test；本地回环，不发任何真实请求） ——————————————————————

const SELF_TEST_SSE = [
  { type: "message_start", message: { id: "msg_selftest", usage: { input_tokens: 5 } } },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "自检思考" } },
  { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "self-test-signature" } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", id: "srvtoolu_selftest", name: "web_search", input: {} } },
  { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: JSON.stringify({ query: "SELF-TEST-QUERY" }) } },
  { type: "content_block_stop", index: 1 },
  { type: "content_block_start", index: 2, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_selftest", content: [{ type: "web_search_result", title: "SELF-TEST-TITLE", url: "https://self-test.invalid/" }] } },
  { type: "content_block_stop", index: 2 },
  // 关键：text 以「start 空文本 + text_delta 增量」流式送达——修复 ① 的证明对象。
  { type: "content_block_start", index: 3, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 3, delta: { type: "text_delta", text: "自检应答" } },
  { type: "content_block_stop", index: 3 },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3, server_tool_use: { web_search_requests: 1 } } },
  { type: "message_stop" },
];

/** 只含工具块、无 text/thinking 的响应——自检场景 B：回放为空 ⇒ ②-a 必须**省略** assistant（绝不发空内容）。 */
const SELF_TEST_SSE_TOOLS_ONLY = [
  { type: "message_start", message: { id: "msg_selftest_tools_only", usage: { input_tokens: 5 } } },
  { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "srvtoolu_selftest2", name: "web_search", input: {} } },
  { type: "content_block_stop", index: 0 },
  { type: "content_block_start", index: 1, content_block: { type: "web_search_tool_result", tool_use_id: "srvtoolu_selftest2", content: [{ type: "web_search_result", title: "SELF-TEST-TITLE-2", url: "https://self-test.invalid/2" }] } },
  { type: "content_block_stop", index: 1 },
  { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2, server_tool_use: { web_search_requests: 1 } } },
  { type: "message_stop" },
];

async function runSelfTest(): Promise<never> {
  const requests: Record<string, unknown>[] = [];
  const sseQueue: unknown[][] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      } catch { /* 空体按空对象 */ }
      requests.push(body);
      // 仿真实测网关行为（首批探针 ② round2 的 500）：空内容 assistant 消息 ⇒ 500 拒。
      const messages = Array.isArray(body["messages"]) ? (body["messages"] as Array<Record<string, unknown>>) : [];
      for (let index = 0; index < messages.length; index += 1) {
        const content = messages[index]?.["content"];
        if (messages[index]?.["role"] === "assistant" && Array.isArray(content) && content.length === 0) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: `messages.${index}: all messages must have non-empty content` } }));
          return;
        }
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      const script = sseQueue.shift() ?? SELF_TEST_SSE;
      res.end(script.map((event) => `event: ${String((event as { type: string }).type)}\ndata: ${JSON.stringify(event)}\n\n`).join(""));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = address !== null && typeof address === "object" ? address.port : 0;
  endpoint = `http://127.0.0.1:${port}/v1/messages`;

  const failures: string[] = [];
  const check = (ok: boolean, label: string): void => {
    if (!ok) failures.push(label);
  };
  try {
    // 场景 A：正常响应（流式 text + 签名 thinking）——验证修复 ①（捕获）与 ②-a（非空回放）。
    sseQueue.push(SELF_TEST_SSE, SELF_TEST_SSE, SELF_TEST_SSE);
    const replayA = await runReplayProbes();
    // 场景 B：round1 只回工具块（无 text/thinking）⇒ 回放为空 ⇒ ②-a 必须**省略** assistant（绝不发空内容）。
    sseQueue.push(SELF_TEST_SSE_TOOLS_ONLY, SELF_TEST_SSE);
    const replayB = await runReplayProbes();

    const messagesOf = (body: Record<string, unknown>): Array<Record<string, unknown>> => (Array.isArray(body["messages"]) ? (body["messages"] as Array<Record<string, unknown>>) : []);
    const assistantBlocks = (messages: Array<Record<string, unknown>>): unknown[] => {
      const message = messages.find((item) => item["role"] === "assistant");
      return Array.isArray(message?.["content"]) ? (message?.["content"] as unknown[]) : [];
    };

    check(requests.length === 5, `应恰 5 个回环请求（A: round1/2a/2b；B: round1/2b），实际 ${requests.length}`);
    // —— 场景 A 断言 ——
    check(JSON.stringify(replayA.part["replayShape"]).includes('"text"'), `A.replayShape 应含流式 text，实际 ${JSON.stringify(replayA.part["replayShape"])}`);
    check(JSON.stringify(replayA.part["replayShape"]).includes("thinking(签名回放)"), `A.replayShape 应含签名 thinking 回放，实际 ${JSON.stringify(replayA.part["replayShape"])}`);
    check(assistantBlocks(messagesOf(requests[1] ?? {})).length >= 2, `②-a 请求的 assistant 内容应非空（text+thinking），实际 ${assistantBlocks(messagesOf(requests[1] ?? {})).length} 块`);
    check(String(replayA.part["verdict2a"]).includes("接受"), `A.②-a 判读应为「接受」，实际：${String(replayA.part["verdict2a"])}`);
    check(String(replayA.part["verdict2b"]).includes("接受"), `A.②-b 判读应为「接受」，实际：${String(replayA.part["verdict2b"])}`);
    check(JSON.stringify((requests[0] ?? {})["tools"]).includes('"web_search_20250305"'), "round1 请求应携带 web_search 声明");
    // —— 场景 B 断言（修复 ② 的承重证明：回放为空 ⇒ 省略 assistant、不产生 500） ——
    check(JSON.stringify(replayB.part["replayShape"]) === "[]", `B.replayShape 应为空数组，实际 ${JSON.stringify(replayB.part["replayShape"])}`);
    check(!("round2a" in replayB.part), "B：回放为空时 ②-a 不得发出请求（round2a 应缺省）");
    check(String(replayB.part["verdict2a"]).includes("不可构造"), `B.②-a 判读应为「不可构造」，实际：${String(replayB.part["verdict2a"])}`);
    check(String(replayB.part["verdict2b"]).includes("接受"), `B.②-b 判读应为「接受」，实际：${String(replayB.part["verdict2b"])}`);
    check(messagesOf(requests[3] ?? {}).length === 1, "B.round1 应为单条 user 消息");
    const b4 = messagesOf(requests[4] ?? {});
    check(b4.length === 2 && b4.every((item) => item["role"] === "user"), `B.②-b 应为相邻两条 user 消息，实际 ${JSON.stringify(b4.map((item) => item["role"]))}`);
    // —— 全局断言：任何请求里都不得出现空内容 assistant 消息 ——
    for (const [index, body] of requests.entries()) {
      for (const message of messagesOf(body)) {
        const content = message["content"];
        check(!(message["role"] === "assistant" && Array.isArray(content) && content.length === 0), `请求 #${index} 不得携带空内容 assistant 消息`);
      }
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (failures.length > 0) {
    console.error(`[probe][self-test] FAIL（${failures.length} 项）——不发真实请求；以下为断言明细：`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exit(1);
  }
  console.log(`[probe][self-test] PASS：5 个本地回环请求；场景 A（流式 text + 签名 thinking 捕获、②-a 非空回放、②-b 相邻 user）与场景 B（回放为空 ⇒ 省略 assistant、不发空内容）全部通过。（未发任何真实网络请求）`);
  process.exit(0);
}

/** §② 的判读说明由 runReplayProbes 的 verdict 字段承载；此处导出给自检与真实路径共用。 */
if (SELF_TEST) {
  await runSelfTest();
}

// —————————————————————— 真实探测（客户运行；以下与首批探针同构，§② 已按修复轮更新） ——————————————————————

const report: Record<string, unknown> = { endpoint, model: scrub(model), parts: {} as Record<string, unknown> };
console.log(`[probe] 目标端点：${endpoint}（model=${model}）；开始逐项探测（只报形状与计数，不含查询串/正文）…`);

// —— ① 逐工具一次性声明请求 ——
const part1: Record<string, ProbeSummary> = {};
for (const tool of PROBE_TOOLS) {
  // code_execution 无 max_uses 参数（按其形状不带该字段）；web_search / web_fetch 带 max_uses:1（与产品缺省一致）。
  const declaration = tool.id === "code_execution" ? { type: tool.type, name: tool.id } : { type: tool.type, name: tool.id, max_uses: 1 };
  const { summary } = await probeOnce(tool.id, [declaration], [{ role: "user", content: tool.prompt }]);
  part1[tool.id] = summary;
  console.log(`[probe] ① ${tool.id}（${tool.type}）：${JSON.stringify(summary)}`);
}
(report["parts"] as Record<string, unknown>)["1.one-shot-declarations"] = part1;

// —— ② 两轮复放（②-a 剥离转录复放 / ②-b 相邻 user 消息形态；判读见 verdict 字段） ——
const replay = await runReplayProbes();
console.log(`[probe] ② 两轮复放：${JSON.stringify(replay.part)}`);
(report["parts"] as Record<string, unknown>)["2.replay-stripped-transcript"] = replay.part;

// —— ③ max_uses 上限形状（声明 max_uses:1，请模型连搜两次；见到 *_tool_result_error 即报码） ——
const limit = await probeOnce(
  "max-uses",
  [{ type: PROBE_TOOLS[0].type, name: PROBE_TOOLS[0].id, max_uses: 1 }],
  [{ role: "user", content: `请**依次**执行两次搜索再回答：先搜索「${SEARCH_ALPHA}」，紧接着再搜索「${SEARCH_BETA}」，分别报告结果条数。` }],
);
console.log(`[probe] ③ max_uses 上限形状：${JSON.stringify(limit.summary)}`);
(report["parts"] as Record<string, unknown>)["3.max-uses-shape"] = limit.summary;

// —— ④ usage.server_tool_use 计量回传（聚合各请求） ——
const usagePart = {
  oneShot: Object.fromEntries(Object.entries(part1).map(([id, summary]) => [id, summary.usageServerTools ?? null])),
  replayRound1: replay.round1.usageServerTools ?? null,
  replayRound2a: replay.round2a?.usageServerTools ?? null,
  replayRound2b: replay.round2b.usageServerTools ?? null,
  maxUses: limit.summary.usageServerTools ?? null,
};
console.log(`[probe] ④ usage.server_tool_use 回传：${JSON.stringify(usagePart)}`);
(report["parts"] as Record<string, unknown>)["4.usage-returned"] = usagePart;

// —— ⑤ 观察项：pause_turn / 异常 stop_reason ——
const stopReasons = [...Object.values(part1), replay.round1, ...(replay.round2a !== undefined ? [replay.round2a] : []), replay.round2b, limit.summary].map((summary) => summary.stopReason ?? "（未捕获）");
const pauseSeen = stopReasons.some((reason) => reason === "pause_turn");
const observedPart = { stopReasons, pauseTurnSeen: pauseSeen, note: pauseSeen ? "已见 pause_turn——如产品需要自动续跑，留 v2" : "本轮未见 pause_turn（该项属可选观察，未见即如实记「未见」）" };
console.log(`[probe] ⑤ 观察项：${JSON.stringify(observedPart)}`);
(report["parts"] as Record<string, unknown>)["5.observations"] = observedPart;

console.log("——[probe] 结构化摘要（可整段转达 PM；不含查询串/正文）——");
console.log(JSON.stringify(report, null, 2));
