// 运行时核心 A1 工具层测试：request_download 注册/参数形状/回执转达/AC-23/中止/Service W-1。
// 2026-11-04 download-requests；依据方案 P1.1 §3.3、团队计划 §4.3 A1、V1 AC-1/2/15/23。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  DOWNLOAD_ERROR_CODES,
  DOWNLOAD_FILENAME_MAX_CHARS,
  DOWNLOAD_PURPOSE_MAX_BYTES,
  DOWNLOAD_URL_MAX_BYTES,
  type DownloadRequestInput,
  type DownloadRequestMetadata,
  type DownloadRequestResult,
  type RequestDownloadFn,
} from "../../src/model/download.ts";
import {
  type RoleSession,
  type RuntimeProviderFactory,
  type RuntimeProviderOptions,
  type SessionEvent,
} from "../../src/model/runtime.ts";
import {
  REQUEST_CONFIRMATION_TOOL_NAME,
  REQUEST_DOWNLOAD_TOOL_NAME,
  buildGovernedTools,
} from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { createRuntimeAdapter } from "../../src/service/runtime/session.ts";
import { createEventQueue } from "../../src/common/runtime-core/event-queue.ts";
import { allow, registerControlledDisplayProfile, role } from "./fixtures.ts";

const validArgs = { url: "https://example.com/report.csv", purpose: "下载测试数据" };
const successReceipt: DownloadRequestResult = {
  ok: true,
  message: "request_download：已下载「example.com」→ download/report.csv（12 字节，sha256 9f…，审批来源：客户）",
  path: "download/report.csv",
  bytes: 12,
  sha256: "9f".repeat(32),
  finalUrl: "https://example.com/report.csv",
  approval: { by: "customer" },
};
const successBase = successReceipt as Extract<DownloadRequestResult, { ok: true }>;

function call(args: Record<string, unknown>, extra?: { toolCallId?: string; signal?: AbortSignal }) {
  return { name: REQUEST_DOWNLOAD_TOOL_NAME, args, ...extra };
}

function toolMap(options?: Parameters<typeof buildGovernedTools>[1]) {
  return new Map(buildGovernedTools(allow, options).map((tool) => [tool.name, tool]));
}

test("AC-1 注册：未注入 requestDownload ⇒ request_download 不注册；注入 ⇒ 只新增这一只且既有工具不变", () => {
  const base = buildGovernedTools(allow);
  const baseNames = base.map((tool) => tool.name);
  assert.equal(baseNames.includes(REQUEST_DOWNLOAD_TOOL_NAME), false, "未注入时必须不存在");

  const withTool = buildGovernedTools(allow, { requestDownload: async () => successReceipt });
  const added = withTool.filter((tool) => !baseNames.includes(tool.name)).map((tool) => tool.name);
  assert.deepEqual(added, [REQUEST_DOWNLOAD_TOOL_NAME], "注入只新增 request_download");
  for (const before of base) {
    const after = withTool.find((tool) => tool.name === before.name)!;
    assert.deepEqual(after.inputSchema, before.inputSchema, `${before.name} schema 不得变化`);
    assert.equal(after.description, before.description, `${before.name} 描述不得变化`);
    assert.equal(after.displayInputRule, before.displayInputRule);
    assert.equal(after.executionMode, before.executionMode);
  }
});

test("schema：url/purpose 必填、filename 可选、additionalProperties:false、sequential；描述钉关键语义", () => {
  const desc = describeTool(REQUEST_DOWNLOAD_TOOL_NAME);
  assert.deepEqual(desc.parameters.required, ["url", "purpose"]);
  assert.equal(desc.parameters.additionalProperties, false);
  const props = desc.parameters.properties as Record<string, { type?: string; maxLength?: number; minLength?: number }>;
  assert.deepEqual(Object.keys(props).sort(), ["filename", "purpose", "url"]);
  assert.equal(props.url.type, "string");
  assert.equal(props.url.maxLength, DOWNLOAD_URL_MAX_BYTES);
  assert.equal(props.purpose.maxLength, DOWNLOAD_PURPOSE_MAX_BYTES);
  assert.equal(props.filename.maxLength, DOWNLOAD_FILENAME_MAX_CHARS);
  assert.equal(desc.executionMode, "sequential");

  for (const need of [
    /下载文件申请/,
    /http\/https/,
    /user:pass@/,
    /@审批/,
    /替我审批/,
    /客户确认卡/,
    /download\//,
    /download-\*/,
    /不自动重试/,
    /download-redirect-cross-host/,
    /request_confirmation/,
    /不返回文件内容/,
  ]) {
    assert.match(desc.description, need);
  }
  const guidelines = (desc.promptGuidelines ?? []).join("\n");
  assert.match(guidelines, /申请≠批准/);
  assert.match(guidelines, /重新申请/);
  assert.match(guidelines, /不返回文件内容/);
});

test("合法参数：trim 后交给能力一次、filename 缺省不造键、metadata 完整", async () => {
  const received: Array<{ input: DownloadRequestInput; metadata?: DownloadRequestMetadata }> = [];
  const fn: RequestDownloadFn = async (input, metadata) => {
    received.push({ input, metadata });
    return successReceipt;
  };
  const tool = toolMap({ requestDownload: fn, roleId: "core", runtime: "demo", currentTurnId: () => "turn-1" }).get(
    REQUEST_DOWNLOAD_TOOL_NAME,
  )!;
  const controller = new AbortController();
  const first = await tool.handler(
    call({ url: "  https://example.com/report.csv  ", purpose: "  下载测试数据  " }, { toolCallId: "call-1", signal: controller.signal }),
  );
  assert.equal(first.ok, true);
  assert.equal(first.message, successReceipt.message);
  assert.equal(received.length, 1);
  assert.deepEqual(received[0]!.input, { url: "https://example.com/report.csv", purpose: "下载测试数据" });
  assert.equal(Object.prototype.hasOwnProperty.call(received[0]!.input, "filename"), false, "缺省 filename 不得造键");
  assert.equal(received[0]!.metadata?.roleId, "core");
  assert.equal(received[0]!.metadata?.runtime, "demo");
  assert.equal(received[0]!.metadata?.turnId, "turn-1");
  assert.equal(received[0]!.metadata?.toolCallId, "call-1");
  assert.equal(received[0]!.metadata?.signal, controller.signal);

  await tool.handler(call({ ...validArgs, filename: "report.csv" }));
  assert.deepEqual(received[1]!.input, { url: validArgs.url, purpose: validArgs.purpose, filename: "report.csv" });

  await tool.handler(call({ ...validArgs, filename: "   " }));
  assert.equal(Object.prototype.hasOwnProperty.call(received[2]!.input, "filename"), false, "纯空白 filename 视作未提供");
});

test("AC-2 参数校验：非法形状 ⇒ ok:false + download-invalid-arguments，能力调用 0；边界值合法", async () => {
  let calls = 0;
  const fn: RequestDownloadFn = async () => {
    calls += 1;
    return successReceipt;
  };
  const tool = toolMap({ requestDownload: fn }).get(REQUEST_DOWNLOAD_TOOL_NAME)!;

  const longUrl = `https://example.com/${"a".repeat(DOWNLOAD_URL_MAX_BYTES)}`;
  const longPurpose = "说".repeat(400); // 1200 UTF-8 字节 > 1024
  const invalid: Record<string, unknown>[] = [
    {},
    { purpose: "x" },
    { url: "", purpose: "x" },
    { url: "   ", purpose: "x" },
    { url: 42, purpose: "x" },
    { url: "ftp://example.com/a", purpose: "x" },
    { url: "file:///C:/a", purpose: "x" },
    { url: "data:text/plain,x", purpose: "x" },
    { url: "not a url", purpose: "x" },
    { url: "http://user:pass@example.com/a", purpose: "x" },
    { url: longUrl, purpose: "x" },
    { url: "https://example.com/a" },
    { url: "https://example.com/a", purpose: "" },
    { url: "https://example.com/a", purpose: "   " },
    { url: "https://example.com/a", purpose: 42 },
    { url: "https://example.com/a", purpose: longPurpose },
    { url: "https://example.com/a", purpose: "x", filename: "a".repeat(DOWNLOAD_FILENAME_MAX_CHARS + 1) },
    { url: "https://example.com/a", purpose: "x", filename: "a\u0000b" },
    { url: "https://example.com/a", purpose: "x", filename: "a/b" },
    { url: "https://example.com/a", purpose: "x", filename: "a\\b" },
    { url: "https://example.com/a", purpose: "x", filename: "a\nb" },
    { url: "https://example.com/a", purpose: "x", filename: 42 },
    { url: "https://example.com/a", purpose: "x", unknown: true },
  ];
  for (const args of invalid) {
    const result = await tool.handler(call(args));
    assert.equal(result.ok, false, `必须拒绝：${JSON.stringify(args)}`);
    assert.match(result.message, /download-invalid-arguments/);
    assert.match(result.message, /未发卡、未联网/);
  }
  assert.equal(calls, 0, "非法参数不得触达能力（不发卡/不联网/不落盘）");

  // 边界：恰达上限仍合法（url/purpose 按 UTF-8 字节；filename 按 Unicode 码点）
  const prefix = "https://example.com/";
  const boundaryUrl = `${prefix}${"a".repeat(DOWNLOAD_URL_MAX_BYTES - prefix.length)}`;
  assert.equal(Buffer.byteLength(boundaryUrl, "utf8"), DOWNLOAD_URL_MAX_BYTES);
  assert.equal((await tool.handler(call({ url: boundaryUrl, purpose: "x" }))).ok, true);
  assert.equal(
    (await tool.handler(call({ url: "https://example.com/a", purpose: "说".repeat(DOWNLOAD_PURPOSE_MAX_BYTES / 3) }))).ok,
    true,
  );
  assert.equal(
    (await tool.handler(call({ url: "https://example.com/a", purpose: "x", filename: "a".repeat(DOWNLOAD_FILENAME_MAX_CHARS) }))).ok,
    true,
  );
  assert.equal(calls, 3);
});

test("AC-15 回执：成功原样转达；17 个失败码带 code；契约外回执与抛错 fail-closed；单次调用无重试", async () => {
  const okTool = toolMap({ requestDownload: async () => successReceipt }).get(REQUEST_DOWNLOAD_TOOL_NAME)!;
  const ok = await okTool.handler(call(validArgs));
  assert.equal(ok.ok, true);
  assert.equal(ok.message, successReceipt.message);

  for (const code of DOWNLOAD_ERROR_CODES) {
    const receipt: DownloadRequestResult = { ok: false, message: "未下载（测试原因）", code };
    const tool = toolMap({ requestDownload: async () => receipt }).get(REQUEST_DOWNLOAD_TOOL_NAME)!;
    const result = await tool.handler(call(validArgs));
    assert.equal(result.ok, false, code);
    assert.match(result.message, new RegExp(code));
    assert.match(result.message, /测试原因/);
  }

  const bare = toolMap({
    requestDownload: async () => ({ ok: false, message: "未下载", code: "download-declined" }),
  }).get(REQUEST_DOWNLOAD_TOOL_NAME)!;
  const bareResult = await bare.handler(call(validArgs));
  assert.match(bareResult.message, /\[技术 code：download-declined\]/, "消息缺 code 时工具追加技术 code");

  const malformed: unknown[] = [
    null,
    "ok",
    {},
    { ok: true, message: "已下载" },
    { ...successBase, path: "../download/a" },
    { ...successBase, path: "download/a/b" },
    { ...successBase, path: "download/.." },
    { ...successBase, sha256: "abc" },
    { ...successBase, bytes: -1 },
    { ...successBase, finalUrl: "" },
    { ...successBase, approval: { by: "system" } },
    { ok: false, message: "x", code: "download-unknown" },
    { ok: false, message: "x" },
  ];
  for (const value of malformed) {
    const tool = toolMap({ requestDownload: async () => value as DownloadRequestResult }).get(REQUEST_DOWNLOAD_TOOL_NAME)!;
    const result = await tool.handler(call(validArgs));
    assert.equal(result.ok, false, `契约外回执必须 fail-closed：${JSON.stringify(value)}`);
    assert.match(result.message, /未返回明确结果|不要当已下载/);
  }

  const thrown = toolMap({
    requestDownload: async () => {
      throw new Error("boom https://secret.example/path");
    },
  }).get(REQUEST_DOWNLOAD_TOOL_NAME)!;
  const thrownResult = await thrown.handler(call(validArgs));
  assert.equal(thrownResult.ok, false);
  assert.match(thrownResult.message, /download-unavailable/);
  assert.doesNotMatch(thrownResult.message, /secret\.example/, "不得把原始异常文本带给模型");

  let count = 0;
  const once = toolMap({
    requestDownload: async () => {
      count += 1;
      return successReceipt;
    },
  }).get(REQUEST_DOWNLOAD_TOOL_NAME)!;
  await once.handler(call(validArgs));
  assert.equal(count, 1, "每次 handler 调用能力恰一次、无自动重试");
});

test("AC-23：request_confirmation 以 cardKind:\"download\" 调用被拒绝且不触达客户通道；schema enum 不变", async () => {
  let channelCalls = 0;
  const tools = toolMap({
    customerInput: async () => {
      channelCalls += 1;
      return { outcome: "declined" };
    },
  });
  const confirm = tools.get(REQUEST_CONFIRMATION_TOOL_NAME)!;
  const result = await confirm.handler({
    name: REQUEST_CONFIRMATION_TOOL_NAME,
    args: { title: "下载确认", cardKind: "download" },
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /cardKind 非法/);
  assert.equal(channelCalls, 0, "非法 cardKind 不得触达客户通道（未发卡）");
  const schema = describeTool(REQUEST_CONFIRMATION_TOOL_NAME);
  const cardKind = (schema.parameters.properties as Record<string, { enum?: string[] }>).cardKind;
  assert.deepEqual(cardKind.enum, ["appointment-write"], "CONFIRM_CARD_KINDS 字面量不变");
});

test("中止：不假设已下载/未下载（能力不触达）", async () => {
  let calls = 0;
  const tool = toolMap({
    requestDownload: async () => {
      calls += 1;
      return successReceipt;
    },
  }).get(REQUEST_DOWNLOAD_TOOL_NAME)!;
  const controller = new AbortController();
  controller.abort();
  const result = await tool.handler(call(validArgs, { signal: controller.signal }));
  assert.equal(result.ok, false);
  assert.match(result.message, /未获最终结果/);
  assert.match(result.message, /不要假设已下载或未下载/);
  assert.equal(calls, 0);
});

function adapterFactory(capture: (options: RuntimeProviderOptions) => void): RuntimeProviderFactory {
  return (options) => {
    registerControlledDisplayProfile(options);
    capture(options);
    return {
      async composeContext() {
        return { systemPrompt: "fixture" };
      },
      async bindRole() {
        const queue = createEventQueue<SessionEvent>();
        const session: RoleSession = {
          async prompt() {},
          events: () => queue.stream,
          async dispose() {
            queue.close();
          },
        };
        return session;
      },
    };
  };
}

const stats = () => ({ readCalls: 0, readBytes: 0, deniedReads: 0, truncatedReads: 0, budgetExceeded: false });

test("W-1 Service 透传：注入 requestDownload ⇒ 普通会话含 request_download；未注入与两种判断会话均不含", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-request-download-"));
  const captured: RuntimeProviderOptions[] = [];
  const factory = adapterFactory((options) => captured.push(options));
  try {
    const withCap = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      requestDownload: async () => successReceipt,
      providerFactories: { claude: factory },
    }).bindRole(role());
    await withCap.dispose();
    assert.equal(
      new Set(captured[0]!.tools.map((tool) => tool.name)).has(REQUEST_DOWNLOAD_TOOL_NAME),
      true,
      "Service 必须透传 request_download",
    );

    const plain = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      providerFactories: { claude: factory },
    }).bindRole(role());
    await plain.dispose();
    assert.equal(
      new Set(captured[1]!.tools.map((tool) => tool.name)).has(REQUEST_DOWNLOAD_TOOL_NAME),
      false,
      "未注入时不得出现 request_download",
    );

    const governance = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      requestDownload: async () => successReceipt,
      governanceJudge: { projectRoot: root, report() {}, stats: stats() },
      providerFactories: { claude: factory },
    }).bindRole(role());
    await governance.dispose();
    assert.deepEqual(
      captured[2]!.tools.map((tool) => tool.name),
      ["judge_read_file", "judge_list_dir", "report_governance_judgement"],
      "治理判断会话结构性无 request_download",
    );

    const shell = await createRuntimeAdapter({
      runtime: "claude",
      gate: allow,
      projectRoot: root,
      skillRoot: root,
      requestDownload: async () => successReceipt,
      shellJudge: { projectRoot: root, report() {}, stats: stats() },
      providerFactories: { claude: factory },
    }).bindRole(role());
    await shell.dispose();
    assert.deepEqual(
      captured[3]!.tools.map((tool) => tool.name),
      ["judge_read_file", "judge_list_dir", "report_shell_judgement"],
      "shell 判断会话结构性无 request_download",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
