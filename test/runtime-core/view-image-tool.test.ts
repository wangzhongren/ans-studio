import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  type RequestAcceptanceResult,
  type RequestGateReviewResult,
  type ViewImageInput,
  type ViewImageFn,
  type WriteGate,
} from "../../src/model/runtime.ts";
import {
  REQUEST_ACCEPTANCE_TOOL_NAME,
  REQUEST_GATE_REVIEW_TOOL_NAME,
  VIEW_IMAGE_MAX_BYTES,
  VIEW_IMAGE_TOOL_NAME,
  buildGovernedTools,
} from "../../src/provider/runtime/tools.ts";
import { describeTool } from "../../src/provider/runtime/schema.ts";
import { allow } from "./fixtures.ts";

const temp = () => mkdtemp(path.join(os.tmpdir(), "ans-view-image-"));
const toolMap = (gate: WriteGate, options?: Parameters<typeof buildGovernedTools>[1]) =>
  new Map(buildGovernedTools(gate, options).map((tool) => [tool.name, tool]));
const call = (args: Record<string, unknown>) => ({ name: VIEW_IMAGE_TOOL_NAME, args });
const SUCCESS_PREFIX = "view_image: ";

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

test("view_image schema：仅 {path}、必填、拒绝未知参数，文案钉住两轮附件/路径/类型/大小/不假装已看", () => {
  const desc = describeTool(VIEW_IMAGE_TOOL_NAME);
  assert.deepEqual(desc.parameters.required, ["path"]);
  assert.equal(desc.parameters.additionalProperties, false);
  const props = desc.parameters.properties as Record<string, { type?: string; description?: string }>;
  assert.deepEqual(Object.keys(props), ["path"]);
  assert.equal(props.path.type, "string");

  const text = [desc.description, ...(desc.promptGuidelines ?? [])].join("\n");
  for (const need of [
    /两轮附件/,
    /下一轮/,
    /本轮只返回文本/,
    /不要假装本轮已看到/,
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
    /未排队/,
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

test("本轮已中止：不调用能力，回执不谎称已提供（排队未获确认）", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "a.png"), Buffer.from([1, 2, 3]));
    let calls = 0;
    const fn: ViewImageFn = async () => { calls += 1; return { ok: true }; };
    const tool = toolMap(allow, { readRoot: root, viewImage: fn }).get(VIEW_IMAGE_TOOL_NAME)!;
    const controller = new AbortController();
    controller.abort();
    const result = await tool.handler({ name: VIEW_IMAGE_TOOL_NAME, args: { path: "a.png" }, signal: controller.signal });
    assert.equal(result.ok, false);
    assert.match(result.message, /本轮已中止/);
    assert.match(result.message, /未获确认/);
    assert.match(result.message, /不要当它已提供/);
    assert.doesNotMatch(result.message, /已读取并排队/);
    assert.equal(calls, 0, "中止时不得触达能力");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("零回归：read_file 仍直接读文本；request_gate_review / request_acceptance 注入与回执不变", async () => {
  const root = await temp();
  try {
    await writeFile(path.join(root, "note.txt"), "hello");
    const gateReviewCalls: unknown[] = [];
    const acceptanceCalls: unknown[] = [];
    const gateReview: RequestGateReviewResult = { ok: true, code: "dispatched", message: "已派 Proof 复核 gate" };
    const acceptance: RequestAcceptanceResult = { ok: true, code: "dispatched", message: "已派独立复核" };
    const byName = toolMap(allow, {
      readRoot: root,
      viewImage: async () => ({ ok: true }),
      requestGateReview: async (input) => { gateReviewCalls.push(input); return gateReview; },
      requestAcceptance: async (input) => { acceptanceCalls.push(input); return acceptance; },
    });

    const read = await byName.get("read_file")!.handler({ name: "read_file", args: { path: "note.txt" } });
    assert.equal(read.ok, true);
    assert.equal(read.message, "read_file: note.txt\n\nhello");

    const reviewed = await byName.get(REQUEST_GATE_REVIEW_TOOL_NAME)!.handler({ name: REQUEST_GATE_REVIEW_TOOL_NAME, args: { gateId: "gate-vertical-slice" } });
    assert.equal(reviewed.ok, true);
    assert.deepEqual(gateReviewCalls, [{ gateId: "gate-vertical-slice" }]);
    assert.match(reviewed.message, /gate 复核已派发/);

    const accepted = await byName.get(REQUEST_ACCEPTANCE_TOOL_NAME)!.handler({ name: REQUEST_ACCEPTANCE_TOOL_NAME, args: {} });
    assert.equal(accepted.ok, true);
    assert.deepEqual(acceptanceCalls, [{}]);
    assert.match(accepted.message, /独立复核已派发/);

    // view_image 的加入不影响两工具的 schema/描述（与只注入两能力时逐字相同）。
    const withoutView = toolMap(allow, {
      requestGateReview: async () => gateReview,
      requestAcceptance: async () => acceptance,
    });
    for (const name of [REQUEST_GATE_REVIEW_TOOL_NAME, REQUEST_ACCEPTANCE_TOOL_NAME]) {
      const before = withoutView.get(name);
      const after = byName.get(name);
      assert.ok(before && after, `${name} 必须在两种注入下都注册`);
      assert.deepEqual(after.inputSchema, before.inputSchema);
      assert.equal(after.description, before.description);
      assert.equal(after.displayInputRule, before.displayInputRule);
      assert.equal(after.executionMode, before.executionMode);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
