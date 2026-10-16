// 门禁引擎测试：F4 拒绝信息可操作化 + allowedByRoot 语义修正（F-5-main；kanban-live 真机轮）
//
// 真机现象（提案 `角色卡/门禁引擎/docs/fix/2026-10-15_fix_kanban-f4-governance-note.md`）：
// su 的治理笔记写入（`docs/su/memo.md` 等）被 F4 硬拒，拒绝原文只说「不在任务 writeSet 内」，
// 却把**边界条目**列在「允许写入的路径」下（覆盖被拒路径的 `docs` 目录赫然在列）⇒ 列表与拒绝
// 语义自相矛盾、全文零恢复指引；su 遂请求「客户聊天授权」——该路径在机制上不可能奏效（发行只经
// `request_confirmation` 的 preview 逐条列路径 + confirmed:true，聊天消息不进发行器）。
//
// 本文件钉住 F-5-main 后的行为（**判定语义零放宽**，fail-closed 不变）：
//  1. F4 仍为拒绝；reason 原头「路径在角色边界内，但不在任务 writeSet 内（F4）：<rel>」逐字保留
//     （跨角色既有测试按该子串断言），其后追加可操作指引（request_confirmation / preview /
//     confirmed:true / 任务型会话出路 / 按会话生效）；
//  2. F4 分支 allowedByRoot ＝**当前已发行可写集**：writeSet 空 ⇒ {skill:[],project:[]}；
//     非空 ⇒ 恰为「在边界内且条件已激活」的 writeSet 项（project）——条件未激活/越界项不计入；
//     边界条目本身（如目录 `docs`）不再出现（消自相矛盾）；
//  3. 非 F4 分支语义回归：allowedByRoot 仍为边界覆盖（F5 缺条件分支、F10 未匹配分支不变）；
//  4. 渲染链（formatDenialMessage，import 先例同 boundary-empty-and-builtin.test.ts:37）：
//     F4 决策渲染后的项目行＝当前已发行可写集；指引与 reason 同现于渲染文本。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { formatDenialMessage } from "../../src/common/pi-adapter/format-denial.ts";
import type { DeniedDecision } from "../../src/common/pi-adapter/format-denial.ts";

// 真实临时根（与 resolve-write.test.ts 同法：F7 realpath 解析的祖先须真实存在）
const ROOT = mkdtempSync(join(tmpdir(), "f4-guidance-"));
const PROJ = join(ROOT, "proj");
const SKILL = join(ROOT, "skill");
mkdirSync(join(PROJ, "src"), { recursive: true });
mkdirSync(SKILL, { recursive: true });

const ctx = { skillRoot: SKILL, projectRoot: PROJ };

after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略清理失败 */
  }
});

const ACC = { accepted: true, source: "test:unit" };

function bnd(entries: any[], acceptance: any = ACC): any {
  return { entries, boundarySource: "test", acceptance };
}
function dir(root: string, path: string): any {
  return { root, path, kind: "directory", purpose: "t" };
}
function cdir(root: string, path: string, condition: string): any {
  return { root, path, kind: "conditional-directory", condition, purpose: "t" };
}
function scope(writeSet: string[], conditions: string[] = []): any {
  return { writeSet, conditions };
}

// ---- 1. F4 reason：仍拒绝 + 原头逐字 + 可操作指引 ----
test("F4：仍拒绝（fail-closed）；原头逐字保留；追加可操作指引（request_confirmation/preview/confirmed:true）", () => {
  const b = bnd([dir("project", "docs")]);
  const s = scope(["docs/别的.md"]);
  const d = resolveWrite("docs/su/memo.md", b, s, ctx);
  assert.equal(d.allowed, false, "F4 判定不得放松：未发行的路径必须仍被拒绝");
  if (d.allowed) return;
  assert.ok(
    d.reason.startsWith("路径在角色边界内，但不在任务 writeSet 内（F4）：docs/su/memo.md"),
    `原头须逐字保留（跨角色测试按该子串断言），实得：${d.reason}`,
  );
  assert.match(d.reason, /request_confirmation/, "指引须点名 request_confirmation");
  assert.match(d.reason, /preview/, "指引须点名 preview（逐条列路径的载体）");
  assert.match(d.reason, /confirmed:true/, "指引须点名 confirmed:true（唯一发行凭据）");
  assert.match(d.reason, /任务 writeSet/, "任务型会话出路须在（加入任务 writeSet）");
  assert.match(d.reason, /按会话生效/, "须注明许可按会话生效");
  assert.match(d.reason, /重建/, "须注明重建/重开后不自动保留");
  assert.equal(d.reason.includes("旧边界快照"), false, "F4 分支不得带旧快照线索（既有约定）");
  // fail-closed 的对照面：同一路径一旦在 writeSet 内（=已发行）→ 放行（判定结果只取决于 writeSet 语义）
  const ok = resolveWrite("docs/su/memo.md", b, scope(["docs/su/memo.md"]), ctx);
  assert.equal(ok.allowed, true, "已发行路径照常放行（本次改动零判定变化）");
});

// ---- 2. F4 分支 allowedByRoot＝当前已发行可写集 ----
test("F4 分支 allowedByRoot：writeSet 空 ⇒ 两根皆空（如实呈现此刻什么也写不了）", () => {
  const b = bnd([dir("project", "docs"), dir("skill", "references")]);
  const d = resolveWrite("docs/a.md", b, scope([]), ctx);
  assert.equal(d.allowed, false);
  if (d.allowed) return;
  assert.match(d.reason, /F4/);
  assert.deepEqual(d.allowedByRoot, { skill: [], project: [] });
});

test("F4 分支 allowedByRoot：恰列出经边界+条件过滤后的 writeSet 项（project）；边界目录本身不再出现", () => {
  const b = bnd([dir("project", "docs")]);
  const s = scope(["docs/su/memo.md", "docs/su/changelog.md", "越界/不在边界内.md"]);
  const d = resolveWrite("docs/other.md", b, s, ctx);
  assert.equal(d.allowed, false);
  if (d.allowed) return;
  // 恰为「在边界内」的两项（越界项不计入）——顺序与 writeSet 一致
  assert.deepEqual(d.allowedByRoot, {
    skill: [],
    project: ["docs/su/memo.md", "docs/su/changelog.md"],
  });
  // 关键回归（真机自相矛盾点）：列表＝已发行集，不再列边界条目 `docs` 本身
  assert.equal(d.allowedByRoot.project.includes("docs"), false, "不得再列边界目录本身（消自相矛盾）");
});

test("F4 分支 allowedByRoot：条件未激活的 writeSet 项不计入（与判定同源过滤）", () => {
  const b = bnd([cdir("project", "docs", "docs-bootstrap"), dir("project", "src")]);
  // ① 声明 conditions：docs 激活 ⇒ docs/a.md 计入；src/ok.ts 计入
  const s1 = scope(["docs/a.md", "src/ok.ts"], ["docs-bootstrap"]);
  const d1 = resolveWrite("src/other.ts", b, s1, ctx);
  assert.equal(d1.allowed, false);
  if (!d1.allowed) {
    assert.match(d1.reason, /F4/);
    assert.deepEqual(d1.allowedByRoot, { skill: [], project: ["docs/a.md", "src/ok.ts"] });
  }
  // ② 未声明 conditions：docs 未激活 ⇒ docs/a.md 虽在 writeSet 里也不计入（此刻写它会被「缺条件」拒）
  const s2 = scope(["docs/a.md", "src/ok.ts"], []);
  const d2 = resolveWrite("src/other.ts", b, s2, ctx);
  assert.equal(d2.allowed, false);
  if (!d2.allowed) {
    assert.match(d2.reason, /F4/);
    assert.deepEqual(d2.allowedByRoot, { skill: [], project: ["src/ok.ts"] });
  }
});

// ---- 3. 非 F4 分支语义回归：allowedByRoot 仍为边界覆盖 ----
test("非 F4 分支语义回归：F5 缺条件分支与未匹配分支的列表仍为边界覆盖（用例期望不改）", () => {
  const b = bnd([cdir("project", "docs", "docs-bootstrap"), dir("project", "src")]);
  // F5 缺条件分支：未激活的 docs 不计入、普通目录 src 照常列出（既有 resolve-write.test.ts:86-94 同法）
  const f5 = resolveWrite("docs/a.md", b, scope(["docs/a.md"], []), ctx);
  assert.equal(f5.allowed, false);
  if (!f5.allowed) {
    assert.match(f5.reason, /缺少条件/);
    assert.deepEqual(f5.allowedByRoot, { skill: [], project: ["src"] });
  }
  // 未匹配分支（F10 既有语义）：列表＝边界覆盖全集（非 writeSet——与 F4 分支形成对照）
  const f10 = resolveWrite("nope/x.ts", b, scope(["nope/x.ts"], []), ctx);
  assert.equal(f10.allowed, false);
  if (!f10.allowed) {
    assert.match(f10.reason, /未匹配任何边界条目/);
    assert.deepEqual(f10.allowedByRoot, { skill: [], project: ["src"] });
  }
});

// ---- 4. 渲染链：formatDenialMessage（两份渲染器逐字同构；此处取 pi-adapter 一份） ----
test("渲染链：F4 决策渲染后项目行＝当前已发行可写集；指引与 reason 同现", () => {
  const b = bnd([dir("project", "docs")]);
  const d = resolveWrite("docs/other.md", b, scope(["docs/su/memo.md"]), ctx);
  assert.equal(d.allowed, false);
  if (d.allowed) return;
  const text = formatDenialMessage(d as DeniedDecision);
  assert.ok(text.startsWith(`写入被拒绝：${d.reason}`), "首行＝「写入被拒绝：reason」（reason 含指引，随之同现）");
  const lines = text.split("\n");
  assert.equal(lines.at(-3), "允许写入的路径（按根分组）：", "按根分组标题保留");
  assert.equal(lines.at(-2), "  skill: （无）");
  assert.equal(
    lines.at(-1),
    "  project: docs/su/memo.md",
    "项目行＝当前已发行可写集（不是边界条目 docs——渲染器代码零改、内容随动）",
  );
  for (const s of ["request_confirmation", "preview", "confirmed:true"]) {
    assert.ok(text.includes(s), `渲染文本须同现指引子串：${s}`);
  }
});
