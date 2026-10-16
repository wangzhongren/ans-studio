// 独立复验（测试角色，2026-10-16）：F-5-main 与 F-6-1/2 的行为核对。
// F-5：独立构造（与实施方 f4-denial-guidance.test.ts 不同形状的夹具：多 issued 项 + 条件门写集 +
//      非 F4 分支回归）——F4 拒绝信息含可操作指引，「允许写入的路径」= 当前已发行可写集语义。
// F-6：自建**最小复刻**（sink 级）：首查被拒 → 刷新一次 → 重试放行落盘 / 仍拒链式原因零副作用 /
//      刷新失败如实 / 无刷新闭包=旧行为。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveWrite } from "../../../src/service/gate/resolve-write.ts";
import { createFileAuditSink, type ShellAuditRecord } from "../../../src/common/编排/shell-audit.ts";
import type { WriteGate } from "../../../src/model/runtime.ts";

const ROOT = mkdtempSync(join(tmpdir(), "ans-verify-f56-"));
const PROJ = join(ROOT, "proj");
const SKILL = join(ROOT, "skill");
import { mkdirSync } from "node:fs";
mkdirSync(join(PROJ, "docs"), { recursive: true });
mkdirSync(SKILL, { recursive: true });
const ctx = { skillRoot: SKILL, projectRoot: PROJ };

test.after(() => { try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* ignore */ } });

const ACC = { accepted: true, source: "verify:independent" };
const bnd = (entries: unknown[]): never => ({ entries, boundarySource: "verify", acceptance: ACC }) as never;
const dir = (path: string) => ({ root: "project", path, kind: "directory", purpose: "v" });
const scope = (writeSet: string[], conditions: string[] = []) => ({ writeSet, conditions });

test("F-5 F4：拒绝如实 + 可操作指引；「允许写入的路径」= 当前已发行可写集（多 issued + 越界滤除）", () => {
  const b = bnd([dir("docs")]);
  // writeSet 三项：两项在边界内（=已发行）、一项越界（src/**，边界只覆盖 docs）。
  const d = resolveWrite("docs/su/memo.md", b, scope(["docs/issued-a.md", "docs/issued-b.md", "src/outside.ts"]), ctx);
  assert.equal(d.allowed, false, "F4 未发行路径必须仍拒（fail-closed）");
  if (d.allowed) return;
  assert.ok(d.reason.startsWith("路径在角色边界内，但不在任务 writeSet 内（F4）：docs/su/memo.md"));
  assert.match(d.reason, /request_confirmation/);
  assert.match(d.reason, /preview/);
  assert.match(d.reason, /confirmed:true/);
  assert.match(d.reason, /许可按会话生效/);
  assert.deepEqual(
    d.allowedByRoot,
    { skill: [], project: ["docs/issued-a.md", "docs/issued-b.md"] },
    "列表必须如实=已发行集（越界项滤除、不得列边界条目 docs 本身）",
  );
  // 空 writeSet：两根皆空 = 「此刻什么也写不了」，与拒绝原因一致。
  const empty = resolveWrite("docs/su/memo.md", b, scope([]), ctx);
  assert.equal(empty.allowed, false);
  if (!empty.allowed) assert.deepEqual(empty.allowedByRoot, { skill: [], project: [] });
  // 对照面：同路径一旦已发行 → 放行（判定结果未被本轮修改）。
  const ok = resolveWrite("docs/su/memo.md", b, scope(["docs/su/memo.md"]), ctx);
  assert.equal(ok.allowed, true, "writeSet 内路径照常放行（判定零变化）");
});

test("F-5 F4：条件未激活的已发行项不计入「当前可写」；条件激活后计入并可真实放行", () => {
  const b = bnd([dir("docs"), { root: "project", path: "gated", kind: "conditional-directory", condition: "v-cond", purpose: "v" }]);
  const inactive = resolveWrite("docs/su/memo.md", b, scope(["docs/a.md", "gated/x.md"], []), ctx);
  assert.equal(inactive.allowed, false);
  if (!inactive.allowed) {
    assert.deepEqual(inactive.allowedByRoot.project, ["docs/a.md"], "条件未激活的 gated/x.md 不得出现在可写列表");
  }
  const active = resolveWrite("docs/su/memo.md", b, scope(["docs/a.md", "gated/x.md"], ["v-cond"]), ctx);
  assert.equal(active.allowed, false);
  if (!active.allowed) {
    assert.deepEqual(active.allowedByRoot.project, ["docs/a.md", "gated/x.md"], "条件激活后如实计入");
  }
  const gatedOk = resolveWrite("gated/x.md", b, scope(["gated/x.md"], ["v-cond"]), ctx);
  assert.equal(gatedOk.allowed, true, "条件激活 + 已发行 ⇒ 放行（条件语义不变）");
});

test("F-5 非 F4 分支回归：未匹配为目标拒绝时列表仍为边界覆盖（语义未被 F4 修改波及）", () => {
  const b = bnd([dir("docs")]);
  const d = resolveWrite("src/other.ts", b, undefined, ctx);
  assert.equal(d.allowed, false, "边界外路径仍拒");
  if (!d.allowed) {
    assert.deepEqual(d.allowedByRoot.project, ["docs"], "非 F4 分支列表＝边界覆盖（既有语义逐字）");
    assert.ok(!/request_confirmation/.test(d.reason), "非 F4 分支不得混入 F4 指引");
  }
});

// —————————————————————— F-6：sink 级最小复刻 ——————————————————————

const RECORD: ShellAuditRecord = {
  timestamp: "2026-10-16T00:00:00.000Z",
  toolCallId: "verify-1",
  command: "ls",
  argv: ["ls"],
  cwd: PROJ,
  conclusion: "allow",
  branch: "c-allow",
  by: "ruleset:verify",
  conditions: ["shell-gate"],
  execution: 0,
};
const denyGate = (reason: string): WriteGate => () => ({ allowed: false, reason, allowedByRoot: { skill: [], project: [] } });
const allowGate: WriteGate = (p) => ({ allowed: true, matchedEntry: { root: "project", path: p, kind: "file", purpose: "audit" } });

test("F-6-1 刷新恢复：首查拒 → 刷新一次 → 重试放行落盘；恢复后直走新门禁（不再刷新）", async () => {
  const root = mkdtempSync(join(tmpdir(), "ans-verify-f6a-"));
  try {
    let refreshes = 0;
    let firstCalls = 0;
    let activeCalls = 0;
    const gate: WriteGate = () => { firstCalls += 1; return { allowed: false, reason: "F6：边界未被接受或缺少证据来源（F6）：拒绝一切写入。", allowedByRoot: { skill: [], project: [] } }; };
    const sink = createFileAuditSink({
      projectRoot: root,
      gate,
      refreshGate: async () => { refreshes += 1; return (p) => { activeCalls += 1; return allowGate(p); }; },
    });
    const first = await sink.append(RECORD);
    assert.equal(first.ok, true, `刷新重试须放行并落盘：${JSON.stringify(first)}`);
    const file = join(root, "docs/audit/shell-gate.jsonl");
    assert.equal(existsSync(file), true, "审计文件须已落盘");
    assert.equal(readFileSync(file, "utf8").trim().split("\n").length, 1, "恰追加一行");
    assert.equal(refreshes, 1, "刷新恰一次");
    // 第二条：直接走新门禁（activeGate 已切换），不再刷新。
    const second = await sink.append({ ...RECORD, toolCallId: "verify-2" });
    assert.equal(second.ok, true);
    assert.equal(refreshes, 1, "恢复后零额外刷新开销");
    assert.equal(activeCalls, 2, "两条都经刷新后的新门禁");
    assert.equal(readFileSync(file, "utf8").trim().split("\n").length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("F-6-1 仍拒：链式原因两段事实（原判 + 重试仍拒）、零副作用；刷新失败/无闭包同样如实", async () => {
  const root = mkdtempSync(join(tmpdir(), "ans-verify-f6b-"));
  try {
    const stillDenied = createFileAuditSink({
      projectRoot: root,
      gate: denyGate("原判：未接受（F6）"),
      refreshGate: async () => denyGate("重解析后：仍未被接受（F6）"),
    });
    const r1 = await stillDenied.append(RECORD);
    assert.equal(r1.ok, false);
    const reason1 = r1.reason ?? "";
    assert.ok(reason1.includes("审计写被门禁拒绝：原判：未接受（F6）"), reason1);
    assert.ok(reason1.includes("已刷新边界快照重试一次，仍被拒：重解析后：仍未被接受（F6）"), reason1);
    assert.equal(existsSync(join(root, "docs")), false, "被拒路径零副作用（不建目录）");
    const refreshFail = createFileAuditSink({
      projectRoot: root,
      gate: denyGate("首查拒"),
      refreshGate: async () => { throw new Error("读取 .ans 失败"); },
    });
    const r2 = await refreshFail.append(RECORD);
    assert.equal(r2.ok, false);
    assert.ok(r2.reason?.includes("刷新边界快照失败") === true, r2.reason ?? "");
    assert.equal(existsSync(join(root, "docs")), false);
    const noRefresh = createFileAuditSink({ projectRoot: root, gate: denyGate("首查拒") });
    const r3 = await noRefresh.append(RECORD);
    assert.equal(r3.ok, false);
    assert.ok(r3.reason?.includes("审计写被门禁拒绝：首查拒"), "缺省无刷新=旧行为（如实原文，且不再猜「缺少条件」）");
    assert.ok(!/缺少/.test(r3.reason ?? ""), "拒绝文案不得再含旧猜测「（缺少 shell-gate 条件？）」");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
