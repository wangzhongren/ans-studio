// test/桌面应用/session-history.test.ts
// 桌面应用（D-1，2026-10-12）：**重启恢复**的主进程侧——会话 JSONL 解析/规范化（防御式）+ 最近会话挑选 +
// 读角色历史（无目录=无历史、坏文件不抛、**跨角色不串**）。夹具＝手写最小 JSONL（首行 header + 每行一 entry），
// 形状照 Pi SDK 的持久化格式（`message` entry 的 `message` 为 `{role, content, timestamp}`；assistant 的
// content 块含 text/toolCall；toolResult 为 `{role:"toolResult", toolName, content, isError, timestamp}`）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  parseSessionJsonl,
  pickLatestSessionFile,
  probeSessionFile,
  readRoleSessionHistory,
  sessionsDirFor,
  SESSIONS_REL_DIR,
} from "../../app/desktop/session-history.ts";
// 锚点键的两侧单源（真机缺陷修复 2026-10-12）：回放侧（本文件）与请求侧（customer-input 载荷）用同一算法。
import { anchorKeyForToolCall, interactionAnchorKey } from "../../app/desktop/request-anchor.ts";

const header = (id = "s1") =>
  JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-10-12T01:00:00.000Z", cwd: "/proj" });
const msgEntry = (id: string, message: unknown, ts = "2026-10-12T01:00:01.000Z") =>
  JSON.stringify({ type: "message", id, parentId: null, timestamp: ts, message });

test("D-1 目录契约 + 解析：header + user/assistant(含 toolCall)/toolResult(isError) → 规范化行（顺序与时间保留）", () => {
  assert.equal(sessionsDirFor("/p", "r"), path.join("/p", SESSIONS_REL_DIR, "r"), "目录契约：<projectRoot>/.ans/sessions/<roleId>/");
  const text = [
    header(),
    msgEntry("e1", { role: "user", content: "请给角色卡加一节", timestamp: 1 }),
    msgEntry("e2", {
      role: "assistant",
      content: [
        { type: "text", text: "好的，**完成**。" },
        { type: "toolCall", id: "t1", name: "write_file", arguments: {} },
      ],
      timestamp: 2,
    }),
    msgEntry("e3", { role: "toolResult", toolCallId: "t1", toolName: "write_file", content: [{ type: "text", text: "已写入" }], isError: false, timestamp: 3 }),
    msgEntry("e4", { role: "toolResult", toolCallId: "t2", toolName: "write_file", content: [{ type: "text", text: "越界：被拒" }], isError: true, timestamp: 4 }),
  ].join("\n");
  const r = parseSessionJsonl(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map((x) => x.kind), ["user", "assistant", "tool", "tool", "denied"], "entry → 界面行 kind 规范化");
  assert.equal(r.rows[0].text, "请给角色卡加一节");
  assert.equal(r.rows[1].text, "好的，**完成**。", "assistant 文本原样（渲染侧再走 Markdown/esc）");
  assert.equal(r.rows[2].text, "调用工具 write_file");
  assert.equal(r.rows[3].text, "write_file：已写入");
  assert.equal(r.rows[4].text, "write_file：越界：被拒", "isError 的 toolResult → denied 行");
  assert.equal(r.rows[1].at, "2026-10-12T01:00:01.000Z", "at 取 entry 时间戳（ISO）");
});

test("D-1 防御式：坏行/未知 entry/未知 role 跳过不抛（计入 skipped）；header 不合法 → 整体判失败", () => {
  const mixed = [
    header(),
    "这不是 json{{{",
    JSON.stringify({ type: "usage", id: "u", parentId: null, timestamp: "t" }),
    msgEntry("e9", { role: "system", content: "x" }),
    msgEntry("e1", { role: "user", content: "正文" }),
  ].join("\n");
  const r = parseSessionJsonl(mixed);
  assert.equal(r.ok, true, "坏行不得抛、不得毁掉整份解析");
  assert.deepEqual(r.rows.map((x) => x.text), ["正文"]);
  assert.equal(r.skipped, 3, "坏行 + usage entry + system role 各计一次跳过（如实，不静默）");

  const bad = parseSessionJsonl('{"type":"nope"}\n' + msgEntry("e1", { role: "user", content: "x" }));
  assert.equal(bad.ok, false, "首行不是会话头 → 整体失败（不拿半份垃圾当历史）");
  assert.match(bad.error || "", /会话头/);
  assert.equal(parseSessionJsonl("").ok, false, "空文件 → 失败");
});

test("D-1 pickLatestSessionFile：mtime 大者优先；并列取名字大者（确定性）", () => {  assert.equal(pickLatestSessionFile([]), null);
  assert.equal(pickLatestSessionFile([{ name: "a.jsonl", mtimeMs: 1 }, { name: "b.jsonl", mtimeMs: 2 }]), "b.jsonl");
  assert.equal(pickLatestSessionFile([{ name: "a.jsonl", mtimeMs: 5 }, { name: "b.jsonl", mtimeMs: 5 }]), "b.jsonl", "并列取名字大者");
});

test("D-1 粗探 probeSessionFile：无文件=missing；header 合法=ok；坏文件=corrupt（打开会话时分类 contextSource 用）", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-d1-probe-"));
  try {
    assert.equal(await probeSessionFile(root, "r"), "missing", "无目录/无文件 → missing（真·新会话）");
    const dir = sessionsDirFor(root, "r");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "s.jsonl"), [header("x"), msgEntry("1", { role: "user", content: "hi" })].join("\n"));
    assert.equal(await probeSessionFile(root, "r"), "ok", "header 合法 → ok（recovered）");
    const bad = path.join(dir, "z-bad.jsonl");
    fs.writeFileSync(bad, "不是 jsonl\n{{{");
    const t = new Date(Date.now() + 5000);
    fs.utimesSync(bad, t, t);
    assert.equal(await probeSessionFile(root, "r"), "corrupt", "最近的会话文件头不合法 → corrupt（fresh + 如实说明）");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("D-1 readRoleSessionHistory：无目录=无历史（ok）；挑最近文件；坏文件→ok:false+error；**跨角色不串**", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-d1-"));
  try {
    // 无目录 → 无历史（**不是失败**——从未开过会话的角色即如此）。
    const none = await readRoleSessionHistory(root, "角色A");
    assert.equal(none.ok, true);
    assert.deepEqual(none.rows, []);

    // 两个角色各自的夹具——各读各的（跨角色不串）。
    const dirA = sessionsDirFor(root, "角色A");
    const dirB = sessionsDirFor(root, "角色B");
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    fs.writeFileSync(path.join(dirA, "old.jsonl"), [header("a-old"), msgEntry("1", { role: "user", content: "A 旧会话" })].join("\n"));
    const newA = path.join(dirA, "new.jsonl");
    fs.writeFileSync(
      newA,
      [header("a-new"), msgEntry("1", { role: "user", content: "A 新会话" }), msgEntry("2", { role: "assistant", content: [{ type: "text", text: "收到" }] })].join("\n"),
    );
    fs.writeFileSync(path.join(dirB, "b.jsonl"), [header("b1"), msgEntry("1", { role: "user", content: "B 的会话" })].join("\n"));
    // 显式把 A 的新文件 mtime 调新（避免同毫秒并列——名字也最大，双保险）。
    const t = new Date(Date.now() + 5000);
    fs.utimesSync(newA, t, t);

    const a = await readRoleSessionHistory(root, "角色A");
    assert.equal(a.ok, true);
    assert.equal(a.source, "new.jsonl", "应挑最近（mtime）的会话文件");
    assert.deepEqual(a.rows.map((r) => r.text), ["A 新会话", "收到"]);
    const b = await readRoleSessionHistory(root, "角色B");
    assert.deepEqual(b.rows.map((r) => r.text), ["B 的会话"], "跨角色不串：B 只读 B 的目录");

    // 坏文件（最新）→ ok:false + error（不抛）。
    const zz = path.join(dirB, "zz-latest.jsonl");
    fs.writeFileSync(zz, "垃圾内容不是 jsonl\n{{{");
    const t2 = new Date(Date.now() + 10000);
    fs.utimesSync(zz, t2, t2);
    const b2 = await readRoleSessionHistory(root, "角色B");
    assert.equal(b2.ok, false, "坏文件如实失败、不崩");
    assert.ok(b2.error && b2.error !== "");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ————————————————— 锚点标识（真机缺陷修复 2026-10-12：「已决卡切走再切回跑到聊天流最末尾」） —————————————————
// 会话回放行把交互工具（request_confirmation / request_choice）的「调用行」与「结论行」带上同一标识
// （requestId＝pi toolCallId、anchor、anchorKey）——渲染侧据此把交互卡（重）物化到它发生的位置。

test("锚点标识：request_confirmation 的调用行与结论行带同一 requestId/anchorKey（toolCallId 配对，不解析正文）", () => {
  const text = [
    header(),
    msgEntry("e1", { role: "user", content: "请创建角色", timestamp: 1 }),
    msgEntry("e2", {
      role: "assistant",
      content: [
        { type: "text", text: "先请你确认。" },
        { type: "toolCall", id: "call_00_abc", name: "request_confirmation", arguments: { title: "写入 3 个文件：docs/design/…", detail: "d" } },
      ],
      timestamp: 2,
    }),
    msgEntry("e3", {
      role: "toolResult",
      toolCallId: "call_00_abc",
      toolName: "request_confirmation",
      content: [{ type: "text", text: "request_confirmation：客户已确认「写入 3 个文件：docs/design/…」（confirmed:true；操作者：wzr）" }],
      timestamp: 3,
    }),
  ].join("\n");
  const r = parseSessionJsonl(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map((x) => x.kind), ["user", "assistant", "tool", "tool"], "assistant 文本与 toolCall 拆两行");
  const call = r.rows[2];
  const concl = r.rows[3];
  assert.equal(call.text, "调用工具 request_confirmation", "调用行照旧（文本不变——只加标识）");
  assert.equal(call.requestId, "call_00_abc", "调用行带 pi toolCallId");
  assert.equal(call.anchor, "request", "调用行标 anchor=request");
  assert.equal(concl.requestId, "call_00_abc", "结论行凭 toolCallId 对上**同一个** requestId");
  assert.equal(concl.anchor, "conclusion", "结论行标 anchor=conclusion");
  assert.equal(call.anchorKey, concl.anchorKey, "两行 anchorKey 相同（请求—结论彼此相认）");
  assert.equal(call.anchorKey, interactionAnchorKey("confirm", "写入 3 个文件：docs/design/…"), "键由请求本体 kind+title 单一算法拼出（与请求侧同源）");
  // 锚点键来自请求参数的 title（arguments.title 原样）——不解析结论正文。
  assert.equal(anchorKeyForToolCall("request_confirmation", { title: "写入 3 个文件：docs/design/…" }), call.anchorKey);
});

test("锚点标识：request_choice 同样配对；非交互工具/缺 title/孤儿结论一概不着锚（其余行零变化）", () => {
  const text = [
    header(),
    msgEntry("e1", {
      role: "assistant",
      content: [{ type: "toolCall", id: "call_choice", name: "request_choice", arguments: { title: "选目录名", options: [{ id: "a", label: "a" }] } }],
      timestamp: 1,
    }),
    msgEntry("e2", { role: "toolResult", toolCallId: "call_choice", toolName: "request_choice", content: [{ type: "text", text: "request_choice：客户已选择（a）" }], timestamp: 2 }),
    // 非交互工具：不着锚。
    msgEntry("e3", { role: "assistant", content: [{ type: "toolCall", id: "call_read", name: "read_file", arguments: { path: "docs/x.md" } }], timestamp: 3 }),
    msgEntry("e4", { role: "toolResult", toolCallId: "call_read", toolName: "read_file", content: [{ type: "text", text: "内容" }], timestamp: 4 }),
    // 交互工具但缺 title（工具层本就会拒——成不了请求）：不着锚。
    msgEntry("e5", { role: "assistant", content: [{ type: "toolCall", id: "call_nt", name: "request_confirmation", arguments: {} }], timestamp: 5 }),
    // 孤儿结论（结论在前、调用行不在解析范围内/被跳过）：不着锚（如实）。
    msgEntry("e6", { role: "toolResult", toolCallId: "call_orphan", toolName: "request_confirmation", content: [{ type: "text", text: "x" }], timestamp: 6 }),
  ].join("\n");
  const r = parseSessionJsonl(text);
  assert.equal(r.ok, true);
  assert.deepEqual(r.rows.map((x) => x.kind), ["tool", "tool", "tool", "tool", "tool", "tool"]);
  const choiceCall = r.rows[0];
  const choiceConcl = r.rows[1];
  assert.equal(choiceCall.requestId, "call_choice");
  assert.equal(choiceConcl.requestId, "call_choice");
  assert.equal(choiceCall.anchorKey, interactionAnchorKey("choice", "选目录名"));
  assert.equal(choiceCall.anchorKey, choiceConcl.anchorKey);
  // 非交互/缺 title/孤儿：无任何锚点字段（如实——渲染侧不误配）。
  for (const i of [2, 3, 4, 5]) {
    assert.equal(r.rows[i].requestId, undefined, `行 ${i} 不着锚（requestId 缺省）`);
    assert.equal(r.rows[i].anchorKey, undefined, `行 ${i} 不着锚（anchorKey 缺省）`);
    assert.equal(r.rows[i].anchor, undefined, `行 ${i} 不着锚（anchor 缺省）`);
  }
  // 直接单测：未知工具名 / 非对象 args / 空 title ⇒ null。
  assert.equal(anchorKeyForToolCall("read_file", { title: "x" }), null);
  assert.equal(anchorKeyForToolCall("request_confirmation", "不是对象"), null);
  assert.equal(anchorKeyForToolCall("request_confirmation", { title: "" }), null);
  assert.equal(anchorKeyForToolCall("request_confirmation", { title: 42 }), null);
  // 同一请求本体的两侧键逐字相等（请求侧 interactionAnchorKey ↔ 回放侧 anchorKeyForToolCall）。
  assert.equal(interactionAnchorKey("confirm", "T"), anchorKeyForToolCall("request_confirmation", { title: "T" }));
  assert.equal(interactionAnchorKey("choice", "T"), anchorKeyForToolCall("request_choice", { title: "T" }));
});
