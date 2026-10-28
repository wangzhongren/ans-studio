import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  RUNTIME_VIEW_IMAGE_POLICY,
  type RuntimeViewImagePolicy,
  type ViewImageInput,
  type ViewImageFn,
  type WriteGate,
} from "../../src/model/runtime.ts";
import {
  VIEW_IMAGE_DEFAULT_POLICY,
  VIEW_IMAGE_MAX_BYTES,
  VIEW_IMAGE_MAX_BYTES_PER_TURN,
  VIEW_IMAGE_MAX_IMAGES_PER_TURN,
  VIEW_IMAGE_TOOL_NAME,
  buildGovernedTools,
} from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { DEFAULT_LOCALE, translate } from "../../src/common/shared/i18n/index.ts";
import type { MessageKey } from "../../src/common/shared/i18n/keys.ts";
import { allow } from "./fixtures.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-view-image-"));
const toolMap = (gate: WriteGate, options?: Parameters<typeof buildGovernedTools>[1]) =>
  new Map(buildGovernedTools(gate, options).map((tool) => [tool.name, tool]));
const call = (args: Record<string, unknown>) => ({ name: VIEW_IMAGE_TOOL_NAME, args });
const SUCCESS_PREFIX = "view_image: ";

/** 共享 i18n key（项目管理添加；本测试按同一 key 计算期望文案，避免把文案复制成第二来源）。 */
const SAME_TURN_KEY = "main.viewImage.sameTurn";
const sameTurnText = (relPath: string) => translate(DEFAULT_LOCALE, SAME_TURN_KEY as MessageKey, { path: relPath });
const sameTurnPolicy = (overrides: Partial<RuntimeViewImagePolicy> = {}): RuntimeViewImagePolicy => ({
  delivery: "tool-result",
  maxImageBytes: VIEW_IMAGE_MAX_BYTES,
  maxImagesPerTurn: VIEW_IMAGE_MAX_IMAGES_PER_TURN,
  maxBytesPerTurn: VIEW_IMAGE_MAX_BYTES_PER_TURN,
  ...overrides,
});
const nextTurnPolicy = (overrides: Partial<RuntimeViewImagePolicy> = {}): RuntimeViewImagePolicy => ({
  ...VIEW_IMAGE_DEFAULT_POLICY,
  ...overrides,
});
/** 诊断替身：记录调用方传入的原始字段（在落盘白名单之前），用于断言本层组装的事实。 */
function spyDiagnostics(): { log: NonNullable<Parameters<typeof buildGovernedTools>[1]>["diagnostics"]; events: Array<{ event: string; fields?: Record<string, unknown> }> } {
  const events: Array<{ event: string; fields?: Record<string, unknown> }> = [];
  const log = {
    record(event: string, fields?: Record<string, unknown>) { events.push({ event, fields }); },
    error(event: string, _error: unknown, fields?: Record<string, unknown>) { events.push({ event, fields }); },
  };
  return { log: log as NonNullable<Parameters<typeof buildGovernedTools>[1]>["diagnostics"], events };
}

test("未注入 viewImage ⇒ view_image 不注册（能力缺席 = fail-closed），基础工具集不变", () => {
  const names = buildGovernedTools(allow).map((tool) => tool.name);
  assert.equal(names.includes(VIEW_IMAGE_TOOL_NAME), false);
  assert.deepEqual(names, ["write_file", "edit_file", "read_file", "list_dir"]);
});

test("注入 viewImage ⇒ 只新增 view_image；既有工具 schema/描述/显示规则/执行模式零变化", () => {
  const fn: ViewImageFn = async () => ({ ok: true });
  const base = buildGovernedTools(allow);
  const withTool = buildGovernedTools(allow, { viewImage: fn });
  const added = withTool.filter((tool) => !base.some((before) => before.name === tool.name)).map((tool) => tool.name);
  assert.deepEqual(added, [VIEW_IMAGE_TOOL_NAME], "注入 viewImage 只新增 view_image");
  for (const before of base) {
    const after = withTool.find((tool) => tool.name === before.name);
    assert.ok(after, `既有工具 ${before.name} 必须保留`);
    assert.deepEqual(after.inputSchema, before.inputSchema, `${before.name} 的 schema 不得变化`);
    assert.equal(after.description, before.description, `${before.name} 的描述不得变化`);
    assert.equal(after.displayInputRule, before.displayInputRule);
    assert.equal(after.executionMode, before.executionMode);
  }
  const view = withTool.find((tool) => tool.name === VIEW_IMAGE_TOOL_NAME);
  assert.ok(view);
  assert.equal(view.displayInputRule, "core-path-v1", "view_image 的显示输入规则为路径");
});

test("view_image schema：仅 {path}、必填、拒绝未知参数，文案钉住同轮附图优先/下一轮回退/路径/类型/大小/不假装已看", () => {
  const desc = describeTool(VIEW_IMAGE_TOOL_NAME);
  assert.deepEqual(desc.parameters.required, ["path"]);
  assert.equal(desc.parameters.additionalProperties, false);
  const props = desc.parameters.properties as Record<string, { type?: string; description?: string }>;
  assert.deepEqual(Object.keys(props), ["path"]);
  assert.equal(props.path.type, "string");

  const text = [desc.description, ...(desc.promptGuidelines ?? [])].join("\n");
  for (const need of [
    /同轮/,
    /工具结果/,
    /下一轮/,
    /回退/,
    /未收到图片就不要假装已看到/,
    /仅在运行环境注入了图片能力时才存在/,
    /项目相对路径/,
    /绝对路径/,
    /`\.\.`/,
    /目录/,
    /\.png/,
    /\.jpg/,
    /\.jpeg/,
    /\.webp/,
    /\.gif/,
    /10 MB/,
    /未提供图片/,
    /不写盘/,
    /不联网/,
    /不过写门禁/,
  ]) {
    assert.match(text, need);
  }
  assert.match(props.path.description ?? "", /Project-relative/);
  assert.match(props.path.description ?? "", /absolute paths/i);
  assert.match(props.path.description ?? "", /directories are rejected/);
});

test("合法 png/jpeg（含大写扩展名）/webp/gif：读取二进制、base64 与 MIME 正确，能力收到 {path,image}", async () => {
  const root = await temp();
  try {
    await mkdir(path.join(root, "img"));
    const cases: Array<{ file: string; bytes: Buffer; mime: string }> = [
      { file: "pixel.png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff]), mime: "image/png" },
      { file: "photo.jpg", bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), mime: "image/jpeg" },
      { file: "photo2.JPEG", bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x01, 0x02]), mime: "image/jpeg" },
      { file: "anim.webp", bytes: Buffer.from("RIFF0000WEBPVP8 ", "ascii"), mime: "image/webp" },
      { file: "anim.gif", bytes: Buffer.from("GIF89a\x01\x00\x01\x00", "binary"), mime: "image/gif" },
    ];
    for (const entry of cases) await writeFile(path.join(root, "img", entry.file), entry.bytes);

    const received: ViewImageInput[] = [];
    const fn: ViewImageFn = async (input) => { received.push(input); return { ok: true }; };
    const tool = toolMap(allow, { readRoot: root, viewImage: fn }).get(VIEW_IMAGE_TOOL_NAME)!;

    for (const entry of cases) {
      const rel = `img/${entry.file}`;
      const result = await tool.handler(call({ path: rel }));
      assert.equal(result.ok, true, `${rel} 应成功：${result.message}`);
      assert.equal(
        result.message,
        `${SUCCESS_PREFIX}${rel} 已读取并排队；下一轮以图片附件提供；本轮不要假装已看到。`,
        "成功回执逐字说明本轮只是排队",
      );
      assert.deepEqual(received.at(-1)?.image, {
        type: "image",
        data: entry.bytes.toString("base64"),
        mimeType: entry.mime,
      }, `${rel} 的 base64/MIME 必须逐字正确`);
      assert.equal(received.at(-1)?.path, rel, "能力收到的 path 原样回显");
    }
    assert.equal(received.length, cases.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("能力成功回执的 message 附在固定文案之后（不破坏「已读取并排队」句）", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "a.png"), Buffer.from([1, 2, 3]));
    const tool = toolMap(allow, { readRoot: root, viewImage: async () => ({ ok: true, message: "附件编号 3" }) }).get(VIEW_IMAGE_TOOL_NAME)!;
    const result = await tool.handler(call({ path: "a.png" }));
    assert.equal(result.ok, true);
    assert.equal(result.message, `${SUCCESS_PREFIX}a.png 已读取并排队；下一轮以图片附件提供；本轮不要假装已看到。 附件编号 3`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("路径非法（缺 path/空/NUL/绝对/盘符/.. 越界/目录/不存在）⇒ 工具失败且不调用能力", async () => {
  const root = await temp();
  try {
    await mkdir(path.join(root, "folder.png"));
    let calls = 0;
    const fn: ViewImageFn = async () => { calls += 1; return { ok: true }; };
    const tool = toolMap(allow, { readRoot: root, viewImage: fn }).get(VIEW_IMAGE_TOOL_NAME)!;

    const cases: Array<[string, Record<string, unknown>, RegExp]> = [
      ["缺 path", {}, /缺少 path 参数/],
      ["path 非字符串", { path: 42 }, /缺少 path 参数/],
      ["空 path", { path: "   " }, /path 为空/],
      ["NUL", { path: "a\u0000.png" }, /NUL/],
      ["绝对路径（根内）", { path: path.join(root, "a.png") }, /项目相对路径/],
      ["盘符路径", { path: "C:/tmp/a.png" }, /项目相对路径/],
      ["盘符相对", { path: "C:a.png" }, /项目相对路径/],
      ["父目录越界", { path: "../outside.png" }, /\.\./],
      ["嵌套父目录越界", { path: "img/../../outside.png" }, /\.\./],
      ["反斜杠父目录越界", { path: "img\\..\\..\\outside.png" }, /\.\./],
      ["目录（扩展名伪装）", { path: "folder.png" }, /是目录/],
      ["不存在", { path: "missing.png" }, /不存在或不可访问/],
    ];
    for (const [label, args, pattern] of cases) {
      const result = await tool.handler(call(args));
      assert.equal(result.ok, false, `${label} 必须失败`);
      assert.match(result.message, pattern, `${label} 的失败原因应可读`);
      assert.doesNotMatch(result.message, /已读取并排队/, `${label} 不得谎报已排队`);
    }
    assert.equal(calls, 0, "任何路径校验失败都不得触达能力");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("不支持的类型与超过 10 MB 均失败且不调用能力", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "notes.txt"), "not an image");
    await writeFile(path.join(root, "noext"), Buffer.from([1, 2, 3]));
    await writeFile(path.join(root, "big.png"), Buffer.alloc(VIEW_IMAGE_MAX_BYTES + 1));
    let calls = 0;
    const fn: ViewImageFn = async () => { calls += 1; return { ok: true }; };
    const tool = toolMap(allow, { readRoot: root, viewImage: fn }).get(VIEW_IMAGE_TOOL_NAME)!;

    const txt = await tool.handler(call({ path: "notes.txt" }));
    assert.equal(txt.ok, false);
    assert.match(txt.message, /不支持的图片类型/);
    assert.match(txt.message, /\.png \/ \.jpg \/ \.jpeg \/ \.webp \/ \.gif/);

    const noext = await tool.handler(call({ path: "noext" }));
    assert.equal(noext.ok, false);
    assert.match(noext.message, /无扩展名/);

    const big = await tool.handler(call({ path: "big.png" }));
    assert.equal(big.ok, false);
    assert.match(big.message, /超过上限/);
    assert.match(big.message, /10 MB/);
    assert.doesNotMatch(big.message, /已读取并排队/);

    assert.equal(calls, 0, "类型/大小校验失败不得触达能力");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("能力失败/抛错/契约外回执 ⇒ 工具失败并如实说明未排队（不谎报已提供）", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "a.png"), Buffer.from([1, 2, 3]));
    const variants: Array<[string, ViewImageFn, RegExp]> = [
      ["回执 ok:false", async () => ({ ok: false, message: "队列已满" }), /未能排队.*队列已满/],
      ["抛错", async () => { throw new Error("附件通道不可用"); }, /未能排队.*附件通道不可用/],
      ["回执缺失", (async () => undefined) as unknown as ViewImageFn, /未返回明确回执/],
      ["ok 非布尔", (async () => ({ ok: "yes" })) as unknown as ViewImageFn, /未返回明确回执/],
    ];
    for (const [label, fn, pattern] of variants) {
      const tool = toolMap(allow, { readRoot: root, viewImage: fn }).get(VIEW_IMAGE_TOOL_NAME)!;
      const result = await tool.handler(call({ path: "a.png" }));
      assert.equal(result.ok, false, `${label} 必须失败`);
      assert.match(result.message, pattern);
      assert.doesNotMatch(result.message, /已读取并排队/, `${label} 不得谎报已排队`);
      assert.match(result.message, /本轮不要假装已看到|不要假装本轮已看到|不要假装/, `${label} 必须提醒不要假装已看到`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("本轮已中止（next-turn）：兜底文案保持「排队未获确认 / 下一轮以系统为准」，不调用能力", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "a.png"), Buffer.from([1, 2, 3]));
    let calls = 0;
    const fn: ViewImageFn = async () => { calls += 1; return { ok: true }; };
    const tool = toolMap(allow, { readRoot: root, viewImage: fn, viewImagePolicy: nextTurnPolicy() }).get(VIEW_IMAGE_TOOL_NAME)!;
    const controller = new AbortController();
    controller.abort();
    const result = await tool.handler({ name: VIEW_IMAGE_TOOL_NAME, args: { path: "a.png" }, signal: controller.signal });
    assert.equal(result.ok, false);
    assert.match(result.message, /本轮已中止/);
    assert.match(result.message, /图片附件排队\*\*未获确认/);
    assert.match(result.message, /下一轮是否收到图片以系统为准/);
    assert.match(result.message, /不要当它已提供/);
    assert.doesNotMatch(result.message, /已读取并排队/);
    assert.equal(calls, 0, "中止时不得触达能力");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("本轮已中止（tool-result）：兜底文案不声称排队/下一轮，不交付图片、不调用能力", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "a.png"), Buffer.from([1, 2, 3]));
    let calls = 0;
    const fn: ViewImageFn = async () => { calls += 1; return { ok: true, mode: "tool-result" }; };
    const tool = toolMap(allow, { readRoot: root, viewImage: fn, viewImagePolicy: sameTurnPolicy() }).get(VIEW_IMAGE_TOOL_NAME)!;
    const controller = new AbortController();
    controller.abort();
    const result = await tool.handler({ name: VIEW_IMAGE_TOOL_NAME, args: { path: "a.png" }, signal: controller.signal });
    assert.equal(result.ok, false);
    assert.match(result.message, /本轮已中止/);
    assert.match(result.message, /图片交付\*\*未获确认/);
    assert.match(result.message, /不要当它已提供/);
    assert.doesNotMatch(result.message, /排队/, "tool-result 中止文案不得声称排队");
    assert.doesNotMatch(result.message, /下一轮/, "tool-result 中止文案不得声称下一轮附件");
    assert.equal(result.images, undefined);
    assert.equal(calls, 0, "中止时不得触达能力");

    // 成功返回后恰好中止：包装层必须改写成「交付未获确认」并丢弃 images（不谎称已提供）。
    const late = new AbortController();
    const lateAbort: ViewImageFn = async () => { late.abort(); return { ok: true, mode: "tool-result" }; };
    const lateTool = toolMap(allow, { readRoot: root, viewImage: lateAbort, viewImagePolicy: sameTurnPolicy() }).get(VIEW_IMAGE_TOOL_NAME)!;
    const lateResult = await lateTool.handler({ name: VIEW_IMAGE_TOOL_NAME, args: { path: "a.png" }, signal: late.signal });
    assert.equal(lateResult.ok, false);
    assert.equal(lateResult.images, undefined, "中止改写结果不得保留图片");
    assert.match(lateResult.message, /图片交付\*\*未获确认/);
    assert.doesNotMatch(lateResult.message, /排队|下一轮/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// —————————————— 2026-10-27 同轮看图第一阶段：共享契约 / policy 分支 / 预算 / 审计 ——————————————

test("RUNTIME_VIEW_IMAGE_POLICY：Pi/Claude/Codex 已翻 tool-result（探针通过），demo 仍 next-turn；Claude 5 MB；数值与冻结状态", () => {
  assert.deepEqual(Object.keys(RUNTIME_VIEW_IMAGE_POLICY).sort(), ["claude", "codex", "demo", "pi"]);
  assert.equal(RUNTIME_VIEW_IMAGE_POLICY.pi.delivery, "tool-result", "Pi 真实视觉探针通过后已翻为同轮附图");
  assert.equal(RUNTIME_VIEW_IMAGE_POLICY.claude.delivery, "tool-result", "Claude 真实探针通过后已翻为同轮附图");
  assert.equal(RUNTIME_VIEW_IMAGE_POLICY.codex.delivery, "tool-result", "Codex 以 Chat Completions/Pi 网关真实探针通过后已翻为同轮附图");
  assert.equal(RUNTIME_VIEW_IMAGE_POLICY.claude.maxImageBytes, 5 * 1024 * 1024, "Claude 按设计 §5.2 收紧为 5 MB");
  assert.equal(RUNTIME_VIEW_IMAGE_POLICY.codex.maxImageBytes, VIEW_IMAGE_MAX_BYTES, "Codex 维持 10 MB");
  assert.equal(RUNTIME_VIEW_IMAGE_POLICY.pi.maxImageBytes, VIEW_IMAGE_MAX_BYTES, "Pi 维持 10 MB");
  assert.equal(RUNTIME_VIEW_IMAGE_POLICY.demo.delivery, "next-turn", "demo 无模型，保持下一轮回退");
  assert.equal(RUNTIME_VIEW_IMAGE_POLICY.demo.maxImageBytes, VIEW_IMAGE_MAX_BYTES);
  for (const runtime of ["demo", "pi", "claude", "codex"] as const) {
    const policy = RUNTIME_VIEW_IMAGE_POLICY[runtime];
    assert.equal(policy.maxImagesPerTurn, VIEW_IMAGE_MAX_IMAGES_PER_TURN);
    assert.equal(policy.maxBytesPerTurn, VIEW_IMAGE_MAX_BYTES_PER_TURN);
    assert.equal(Object.isFrozen(policy), true, `${runtime} policy 必须冻结`);
  }
  assert.equal(Object.isFrozen(RUNTIME_VIEW_IMAGE_POLICY), true);
  assert.deepEqual(VIEW_IMAGE_DEFAULT_POLICY, RUNTIME_VIEW_IMAGE_POLICY.demo, "工具层缺省策略与 demo 策略一致");
});

test("policy next-turn（显式注入）：能力调用与成功回执逐字不变；结果不带 images；turnId 透传", async () => {
  const root = await temp();
  try {
    const bytes = Buffer.from([1, 2, 3, 4]);
    await writeFile(path.join(root, "a.png"), bytes);
    const received: ViewImageInput[] = [];
    const fn: ViewImageFn = async (input) => { received.push(input); return { ok: true }; };
    const tool = toolMap(allow, { readRoot: root, viewImage: fn, viewImagePolicy: nextTurnPolicy(), currentTurnId: () => "turn-n1" }).get(VIEW_IMAGE_TOOL_NAME)!;
    const result = await tool.handler(call({ path: "a.png" }));
    assert.equal(result.ok, true);
    assert.equal(result.message, `${SUCCESS_PREFIX}a.png 已读取并排队；下一轮以图片附件提供；本轮不要假装已看到。`);
    assert.equal(result.images, undefined, "next-turn 不得返回模型可见图片");
    assert.equal(result.imageDelivery, "next-turn");
    assert.deepEqual(received, [{
      path: "a.png",
      image: { type: "image", data: bytes.toString("base64"), mimeType: "image/png" },
      turnId: "turn-n1",
    }], "能力收到 {path,image,turnId}，图片字节/MIME 逐字正确");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("policy tool-result：成功结果带 images + imageDelivery；message 来自共享 i18n key；能力收到 turnId", async () => {
  const root = await temp();
  try {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await writeFile(path.join(root, "shot.png"), bytes);
    const received: ViewImageInput[] = [];
    const fn: ViewImageFn = async (input) => { received.push(input); return { ok: true, mode: "tool-result" }; };
    const tool = toolMap(allow, { readRoot: root, viewImage: fn, viewImagePolicy: sameTurnPolicy(), currentTurnId: () => "turn-s1" }).get(VIEW_IMAGE_TOOL_NAME)!;
    const result = await tool.handler(call({ path: "shot.png" }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.images, [{ type: "image", data: bytes.toString("base64"), mimeType: "image/png" }], "同轮结果必须携带模型可见图片");
    assert.equal(result.imageDelivery, "tool-result");
    assert.equal(result.message, sameTurnText("shot.png"), "同轮成功文案必须来自共享 i18n key main.viewImage.sameTurn");
    assert.doesNotMatch(result.message, /已读取并排队/, "同轮模式不得复用下一轮排队文案");
    assert.equal(received.length, 1);
    assert.equal(received[0]?.turnId, "turn-s1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("旧回执 {ok:true}（无 mode）按 next-turn 处理：policy tool-result 下也不交付图片（诚实回退）", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "a.png"), Buffer.from([1, 2, 3]));
    const tool = toolMap(allow, { readRoot: root, viewImage: async () => ({ ok: true }), viewImagePolicy: sameTurnPolicy() }).get(VIEW_IMAGE_TOOL_NAME)!;
    const result = await tool.handler(call({ path: "a.png" }));
    assert.equal(result.ok, true);
    assert.equal(result.images, undefined, "mode 缺省＝next-turn，不得凭空附图");
    assert.equal(result.imageDelivery, "next-turn");
    assert.equal(result.message, `${SUCCESS_PREFIX}a.png 已读取并排队；下一轮以图片附件提供；本轮不要假装已看到。`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("交付契约一致性：policy next-turn + 回执 mode tool-result、非法 mode ⇒ fail-closed 无图不谎称", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "a.png"), Buffer.from([1, 2, 3]));
    const variants: Array<[string, ViewImageFn, RuntimeViewImagePolicy, RegExp]> = [
      ["策略 next-turn 收到 tool-result 回执", async () => ({ ok: true, mode: "tool-result" }), nextTurnPolicy(), /交付契约不一致/],
      ["非法 mode", (async () => ({ ok: true, mode: "same-turn" })) as unknown as ViewImageFn, sameTurnPolicy(), /未返回明确回执/],
    ];
    for (const [label, fn, policy, pattern] of variants) {
      const tool = toolMap(allow, { readRoot: root, viewImage: fn, viewImagePolicy: policy }).get(VIEW_IMAGE_TOOL_NAME)!;
      const result = await tool.handler(call({ path: "a.png" }));
      assert.equal(result.ok, false, `${label} 必须失败`);
      assert.match(result.message, pattern, label);
      assert.equal(result.images, undefined, `${label} 不得交付图片`);
      assert.doesNotMatch(result.message, /已读取并排队/, `${label} 不得谎报已交付`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tool-result 下校验失败不带图且不调用能力（路径/类型/大小矩阵保留）", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "notes.txt"), "not an image");
    let calls = 0;
    const fn: ViewImageFn = async () => { calls += 1; return { ok: true, mode: "tool-result" }; };
    const tool = toolMap(allow, { readRoot: root, viewImage: fn, viewImagePolicy: sameTurnPolicy() }).get(VIEW_IMAGE_TOOL_NAME)!;
    for (const [label, args, pattern] of [
      ["缺 path", {}, /缺少 path 参数/],
      ["父目录越界", { path: "../outside.png" }, /\.\./],
      ["不存在", { path: "missing.png" }, /不存在或不可访问/],
      ["不支持类型", { path: "notes.txt" }, /不支持的图片类型/],
    ] as Array<[string, Record<string, unknown>, RegExp]>) {
      const result = await tool.handler(call(args));
      assert.equal(result.ok, false, `${label} 必须失败`);
      assert.match(result.message, pattern, label);
      assert.equal(result.images, undefined, `${label} 不得携带图片`);
      assert.doesNotMatch(result.message, /已读取并排队/, `${label} 不得谎报已提供`);
    }
    assert.equal(calls, 0, "校验失败不得触达能力");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("每轮预算（tool-result）：超限失败无图；新轮重置；失败释放预留", async () => {
  const root = await temp();
  try {
    for (const file of ["a.png", "b.png", "c.png"]) await writeFile(path.join(root, file), Buffer.from([1, 2, 3]));
    let turn = "turn-1";
    let failures = 0;
    const fn: ViewImageFn = async () => {
      if (failures > 0) { failures -= 1; throw new Error("临时失败"); }
      return { ok: true, mode: "tool-result" };
    };
    const tool = toolMap(allow, {
      readRoot: root, viewImage: fn, currentTurnId: () => turn,
      viewImagePolicy: sameTurnPolicy({ maxImagesPerTurn: 2 }),
    }).get(VIEW_IMAGE_TOOL_NAME)!;

    assert.equal((await tool.handler(call({ path: "a.png" }))).ok, true);
    assert.equal((await tool.handler(call({ path: "b.png" }))).ok, true);
    const third = await tool.handler(call({ path: "c.png" }));
    assert.equal(third.ok, false, "第 3 张必须超过每轮 2 张的预算");
    assert.match(third.message, /数量预算/);
    assert.equal(third.images, undefined);

    turn = "turn-2";
    assert.equal((await tool.handler(call({ path: "c.png" }))).ok, true, "新轮次重置预算");

    // 失败释放：每轮 1 张；第一次能力抛错后，第二次仍可预留并成功。
    turn = "turn-3";
    failures = 1;
    const strict = toolMap(allow, {
      readRoot: root, viewImage: fn, currentTurnId: () => turn,
      viewImagePolicy: sameTurnPolicy({ maxImagesPerTurn: 1 }),
    }).get(VIEW_IMAGE_TOOL_NAME)!;
    const failed = await strict.handler(call({ path: "a.png" }));
    assert.equal(failed.ok, false);
    assert.match(failed.message, /未提供/);
    const retry = await strict.handler(call({ path: "b.png" }));
    assert.equal(retry.ok, true, "失败必须释放预留名额");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("每轮字节预算与更严单图上限：超限失败且不触达能力", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "a.png"), Buffer.from([1, 2, 3, 4]));
    let calls = 0;
    const fn: ViewImageFn = async () => { calls += 1; return { ok: true, mode: "tool-result" }; };

    const byteTool = toolMap(allow, {
      readRoot: root, viewImage: fn, viewImagePolicy: sameTurnPolicy({ maxBytesPerTurn: 3 }),
    }).get(VIEW_IMAGE_TOOL_NAME)!;
    const overBytes = await byteTool.handler(call({ path: "a.png" }));
    assert.equal(overBytes.ok, false);
    assert.match(overBytes.message, /总字节预算/);
    assert.equal(overBytes.images, undefined);

    const strictTool = toolMap(allow, {
      readRoot: root, viewImage: fn, viewImagePolicy: sameTurnPolicy({ maxImageBytes: 2 }),
    }).get(VIEW_IMAGE_TOOL_NAME)!;
    const overSingle = await strictTool.handler(call({ path: "a.png" }));
    assert.equal(overSingle.ok, false);
    assert.match(overSingle.message, /超过上限 2 字节/);
    assert.equal(overSingle.images, undefined);

    assert.equal(calls, 0, "预算/更严上限失败不得触达能力");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("审计：view_image.result 只记 path/mime/bytes/delivery/reason，不落 base64 或 data URL", async () => {
  const root = await temp();
  try {
    const sentinel = Buffer.from("BASE64-SENTINEL-MUST-NOT-LEAK");
    await writeFile(path.join(root, "evidence.png"), sentinel);
    const spy = spyDiagnostics();
    const tool = toolMap(allow, {
      readRoot: root,
      viewImage: async () => ({ ok: true, mode: "tool-result" }),
      viewImagePolicy: sameTurnPolicy(),
      currentTurnId: () => "turn-audit",
      diagnostics: spy.log,
    }).get(VIEW_IMAGE_TOOL_NAME)!;

    const success = await tool.handler(call({ path: "evidence.png" }));
    assert.equal(success.ok, true);
    const missing = await tool.handler(call({ path: "missing.png" }));
    assert.equal(missing.ok, false);

    const successEvent = spy.events.find((entry) => entry.event === "view_image.result" && entry.fields?.ok === true);
    assert.ok(successEvent, "成功必须记录 view_image.result");
    assert.equal(successEvent.fields?.path, "evidence.png");
    assert.equal(successEvent.fields?.mimeType, "image/png");
    assert.equal(successEvent.fields?.bytes, sentinel.length);
    assert.equal(successEvent.fields?.mode, "tool-result");
    assert.equal(successEvent.fields?.turnId, "turn-audit");

    const failureEvent = spy.events.find((entry) => entry.event === "view_image.result" && entry.fields?.ok === false);
    assert.ok(failureEvent, "失败必须记录 view_image.result");
    assert.equal(failureEvent.fields?.reasonCode, "read-failed");
    assert.equal(failureEvent.fields?.path, "missing.png");

    const serialized = JSON.stringify(spy.events);
    assert.equal(serialized.includes(sentinel.toString("base64")), false, "审计不得包含 base64");
    assert.equal(serialized.includes("data:"), false, "审计不得包含 data URL");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
