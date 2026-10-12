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

test("D-1 pickLatestSessionFile：mtime 大者优先；并列取名字大者（确定性）", () => {
  assert.equal(pickLatestSessionFile([]), null);
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
