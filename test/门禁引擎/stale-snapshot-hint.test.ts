// 门禁引擎测试：拒写信息补「旧边界快照」线索（客户派工）
//
// 真机现象：su 已按流程改好盘上边界（文件确含新路径），但角色的**活会话持有开会话时解析的旧边界
// 快照** ⇒ 写入被拒，拒绝信息只说「目标路径未匹配任何边界条目」，不提示「会话快照过期」。
//
// 本文件钉住：
//  1. **触发**（可判定——同步重读盘上边界成功且其覆盖该路径，而快照不含）→ 拒绝理由追加线索
//     （「本会话可能持有旧边界快照……请重开会话后重试」），且**结论仍是拒绝**（fail-closed 不变；
//     文案明写「本次判定不变，仍为拒绝」防误读为放行）；
//  2. **不触发/无法判定 → 原文案逐字不变**（内置标签 / 读盘失败 / 盘上不含该路径 / 新解析报错）；
//  3. 线索只在**最终「未匹配任何边界条目」分支**——F4（writeSet 收窄）等其它拒绝理由不加线索；
//  4. 条件目录按同一套语义（isActive）对照：快照重开若仍不激活（无 scope 无 conditions），**不加**线索。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import {
  builtInBoundarySection,
  reloadBoundaryEntriesSync,
  type StaleBoundaryProbeIo,
} from "../../src/common/门禁引擎/boundary-core.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";
import type { TaskScope } from "../../src/model/decision.ts";

const ROOT = mkdtempSync(join(tmpdir(), "stale-snapshot-"));
const PROJ = join(ROOT, "proj");
const SKILL = join(ROOT, "skill");
const CTX = { skillRoot: SKILL, projectRoot: PROJ };
const REL = "角色卡/实现者/boundary.yaml";

after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

/** 写一个角色边界文件（盘上现状）。 */
function writeBoundary(rel: string, yamlText: string): void {
  const abs = join(PROJ, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, yamlText, "utf8");
}

/** 本次会话持有的**旧快照**（条目为空 = 旧版本不含目标路径；接受门已过以便走到条目匹配）。 */
function staleSnapshot(boundarySource: string): BoundarySection1 {
  return { entries: [], boundarySource, acceptance: { accepted: true, source: "test:已接受" } };
}

const BASE = `目标路径未匹配任何边界条目（根：project）：src/a.ts`;

test("旧快照线索：盘上边界已含该路径而快照不含 → 理由追加线索，结论仍是拒绝", () => {
  writeBoundary(REL, "role: 实现者\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: 新授予的文件\n");

  const d = resolveWrite("src/a.ts", staleSnapshot(REL), undefined, CTX);
  assert.equal(d.allowed, false, "线索只是提示——判定仍必须是拒绝（fail-closed）");
  if (d.allowed) return; // 类型收窄
  assert.ok(d.reason.startsWith(BASE), `理由须以原文案开头，实得：${d.reason}`);
  assert.match(d.reason, /旧边界快照/, "须含「旧边界快照」线索");
  assert.match(d.reason, /重开会话后重试/, "须给出出路（重开会话后重试）");
  assert.match(d.reason, /本次判定不变，仍为拒绝/, "须防误读为放行（明确判定不变）");
  assert.deepEqual(d.allowedByRoot, { skill: [], project: [] }, "允许路径呈现不变（快照侧仍为空）");
});

test("旧快照线索：条件目录按同一套语义对照——快照重开仍不激活时不加线索", () => {
  const relCond = "角色卡/条件角色/boundary.yaml";
  writeBoundary(
    relCond,
    "role: 条件角色\nentries:\n  - kind: conditional-directory\n    path: src/\n    condition: work\n    purpose: 条件目录\n",
  );
  const scope: TaskScope = { writeSet: ["src/a.ts"], conditions: ["work"] };

  // 无 scope：重读的 conditional-directory 不激活（isActive=false）⇒ 重开会话也不会放行 ⇒ 不加线索。
  const noScope = resolveWrite("src/a.ts", staleSnapshot(relCond), undefined, CTX);
  assert.equal(noScope.allowed, false);
  if (!noScope.allowed) {
    assert.equal(noScope.reason, BASE, "不激活时须逐字保持原文案（不误报旧快照）");
    assert.equal(noScope.reason.includes("旧边界快照"), false);
  }

  // 声明了 conditions：重读结果激活并覆盖 ⇒ 真旧快照 ⇒ 加线索。
  const withScope = resolveWrite("src/a.ts", staleSnapshot(relCond), scope, CTX);
  assert.equal(withScope.allowed, false);
  if (!withScope.allowed) {
    assert.match(withScope.reason, /旧边界快照/, "conditions 声明后重开可放行，属真旧快照，须加线索");
  }
});

test("旧快照线索（反向断言）：无法判定/不触发时原文案逐字不变，不得猜测", () => {
  // a) 内置标签（代码合成边界）：不是盘上文件 → 盘上对照不可判定（用「已接受」隔离 F6，直测该分支）
  const synth: BoundarySection1 = {
    entries: [],
    boundarySource: "<built-in:ans-governed-construction SKILL boundary>",
    acceptance: { accepted: true, source: "test:已接受" },
  };
  const da = resolveWrite("src/a.ts", synth, undefined, CTX);
  assert.equal(da.allowed, false);
  if (!da.allowed) {
    assert.equal(da.reason, BASE, "内置标签：逐字保持原文案");
    assert.equal(da.reason.includes("旧边界快照"), false);
  }

  // a2) 真内置边界（acceptance 未接受）：F6 先拒——同样不得出现旧快照线索
  const da2 = resolveWrite("src/a.ts", builtInBoundarySection(), undefined, CTX);
  assert.equal(da2.allowed, false);
  if (!da2.allowed) {
    assert.match(da2.reason, /F6|未被接受/);
    assert.equal(da2.reason.includes("旧边界快照"), false);
  }

  // b) 读盘失败（文件不存在）
  const db = resolveWrite("src/a.ts", staleSnapshot("角色卡/不存在/boundary.yaml"), undefined, CTX);
  assert.equal(db.allowed, false);
  if (!db.allowed) {
    assert.equal(db.reason, BASE, "读盘失败：逐字保持原文案（不猜测）");
    assert.equal(db.reason.includes("旧边界快照"), false);
  }

  // c) 盘上存在但**不含**该路径
  const relOther = "角色卡/其他角色/boundary.yaml";
  writeBoundary(relOther, "role: 其他角色\nentries:\n  - kind: file\n    path: src/other.ts\n    purpose: x\n");
  const dc = resolveWrite("src/a.ts", staleSnapshot(relOther), undefined, CTX);
  assert.equal(dc.allowed, false);
  if (!dc.allowed) {
    assert.equal(dc.reason, BASE, "盘上不含：逐字保持原文案");
    assert.equal(dc.reason.includes("旧边界快照"), false);
  }

  // d) 盘上文件解析报错（对照不可信）
  const relBroken = "角色卡/坏角色/boundary.yaml";
  writeBoundary(relBroken, "entries: [未闭合\nfoo: bar\n");
  const dd = resolveWrite("src/a.ts", staleSnapshot(relBroken), undefined, CTX);
  assert.equal(dd.allowed, false);
  if (!dd.allowed) {
    assert.equal(dd.reason, BASE, "新解析报错：逐字保持原文案（不猜测）");
    assert.equal(dd.reason.includes("旧边界快照"), false);
  }
});

test("旧快照线索：只在最终「未匹配任何边界条目」分支——F4 收窄等其它拒绝理由不加", () => {
  const accepted: BoundarySection1 = {
    entries: [{ root: "project", path: "src/a.ts", kind: "file", purpose: "快照已覆盖" }],
    boundarySource: REL,
    acceptance: { accepted: true, source: "test:已接受" },
  };
  // 本拒绝是 F4（writeSet 不含）——快照**已覆盖**该路径，与「旧快照」无关；判定在 F4 分支即返回，
  // 根本不会走到盘上对照，故此处也不依赖任何盘面状态。
  const d = resolveWrite("src/a.ts", accepted, { writeSet: ["src/b.ts"], conditions: [] }, CTX);
  assert.equal(d.allowed, false);
  if (!d.allowed) {
    assert.match(d.reason, /writeSet/, "应是 F4 拒绝理由");
    assert.equal(d.reason.includes("旧边界快照"), false, "F4 拒绝不得加旧快照线索");
  }
});

// ———————————— 缓存（客户派工：拒写路径的同步读盘加缓存） ————————————

/** 计数桩：包真实 fs，只统计 read 次数（stat 廉价、每次仍须执行以检测变更）。 */
function countingIo(): { io: StaleBoundaryProbeIo; reads: () => number } {
  let reads = 0;
  return {
    io: {
      stat: (p) => {
        const s = statSync(p);
        return { mtimeMs: s.mtimeMs, size: s.size };
      },
      read: (p) => {
        reads++;
        return readFileSync(p, "utf8");
      },
    },
    reads: () => reads,
  };
}

test("缓存：未变 → 只 stat 不重读；同尺寸内容变更（mtime 变）仍被检出；坏文件与内置标签行为不变", () => {
  const rel = "角色卡/缓存角色/boundary.yaml";
  const abs = join(PROJ, rel);
  const v1 = "role: 缓存角色\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: 版本一\n";
  const v2 = "role: 缓存角色\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: 版本二\n";
  assert.equal(Buffer.byteLength(v1, "utf8"), Buffer.byteLength(v2, "utf8"), "本用例前提：两版本同字节大小");

  writeBoundary(rel, v1);
  utimesSync(abs, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z")); // 固定 mtime，确定性
  const { io, reads } = countingIo();

  const first = reloadBoundaryEntriesSync(rel, PROJ, SKILL, io);
  assert.ok(first && first[0].purpose === "版本一");
  assert.equal(reads(), 1, "首次：须真实读取");

  const second = reloadBoundaryEntriesSync(rel, PROJ, SKILL, io);
  assert.ok(second && second[0].purpose === "版本一");
  assert.equal(reads(), 1, "文件未变：命中缓存，不得重复读盘（读取与解析均跳过）");

  // 同尺寸内容变更 + mtime 变更（真实写入都会更新 mtime）→ 必须重读检出，缓存不得粘住旧内容
  writeBoundary(rel, v2);
  utimesSync(abs, new Date("2026-01-02T00:00:00Z"), new Date("2026-01-02T00:00:00Z"));
  const third = reloadBoundaryEntriesSync(rel, PROJ, SKILL, io);
  assert.ok(third && third[0].purpose === "版本二", "同尺寸变更须被检出（mtime+size 判定）");
  assert.equal(reads(), 2, "变更后须重读恰一次");

  // 坏文件：首次解析失败 → null，并按 mtime+size 记忆（同状态不反复解析）
  const relBroken2 = "角色卡/缓存坏角色/boundary.yaml";
  const absBroken = join(PROJ, relBroken2);
  writeBoundary(relBroken2, "entries: [未闭合\nfoo: bar\n");
  utimesSync(absBroken, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
  assert.equal(reloadBoundaryEntriesSync(relBroken2, PROJ, SKILL, io), null);
  assert.equal(reads(), 3);
  assert.equal(reloadBoundaryEntriesSync(relBroken2, PROJ, SKILL, io), null);
  assert.equal(reads(), 3, "坏文件同状态：命中缓存，不反复解析");

  // 内置标签：零 I/O（不经过盘面）
  assert.equal(reloadBoundaryEntriesSync("<built-in:x>", PROJ, SKILL, io), null);
  assert.equal(reads(), 3);

  // 读盘失败（文件不存在）：stat 即失败，无读取；不缓存失败（文件出现后立即可判定）
  assert.equal(reloadBoundaryEntriesSync("角色卡/从未存在/boundary.yaml", PROJ, SKILL, io), null);
  assert.equal(reads(), 3);
});

test("缓存经 resolveWrite 透明：连续两次同盘面线索一致；盘面变更后立即失效（端到端）", () => {
  const rel = "角色卡/缓存集成/boundary.yaml";
  const abs = join(PROJ, rel);
  writeBoundary(rel, "role: 缓存集成\nentries:\n  - kind: file\n    path: src/a.ts\n    purpose: 旧版含该路径\n");
  utimesSync(abs, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
  const snapshot = staleSnapshot(rel);

  const d1 = resolveWrite("src/a.ts", snapshot, undefined, CTX);
  const d2 = resolveWrite("src/a.ts", snapshot, undefined, CTX);
  for (const d of [d1, d2]) {
    assert.equal(d.allowed, false);
    if (!d.allowed) assert.match(d.reason, /旧边界快照/, "同盘面两次调用线索应一致（缓存透明）");
  }

  // 盘面变更（移除该路径；用不同尺寸内容，失效判定不依赖 mtime 粒度）
  writeBoundary(rel, "role: 缓存集成\nentries:\n  - kind: file\n    path: src/别的更长路径.ts\n    purpose: 变更后不含\n");
  utimesSync(abs, new Date("2026-01-02T00:00:00Z"), new Date("2026-01-02T00:00:00Z"));
  const d3 = resolveWrite("src/a.ts", snapshot, undefined, CTX);
  assert.equal(d3.allowed, false);
  if (!d3.allowed) {
    assert.equal(d3.reason, BASE, "盘面不再覆盖：线索立即失效，原文案逐字恢复");
    assert.equal(d3.reason.includes("旧边界快照"), false);
  }
});
