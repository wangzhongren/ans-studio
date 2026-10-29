// test/编排/shell-post-audit.test.ts
// 2026-10-29（方案 v2.1 §6.5）：执行后写审计——快照 diff（新增/修改/删除）、越界判定（与写区同一
// checkWrite + 禁写前缀）、审计记录（仅越界时写；写失败不改变回执）；快照排除 .ans/.git/node_modules 等。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createShellPostAudit,
  diffTreeSnapshots,
  findOutOfBoundChanges,
  snapshotProjectTree,
  type ShellPostAuditChange,
  type ShellPostAuditRecord,
  type TreeSnapshot,
} from "../../src/common/编排/shell-post-audit.ts";

const req = (toolCallId = "call-1") => ({ command: "node script.mjs", argv: ["node", "script.mjs"], cwd: "/proj", toolCallId });

test("快照 diff：新增/修改/删除；mtime 或 size 变化即 modified", () => {
  const before: TreeSnapshot = new Map([
    ["src/a.ts", { mtimeMs: 1, size: 10 }],
    ["src/b.ts", { mtimeMs: 2, size: 20 }],
    ["src/gone.ts", { mtimeMs: 3, size: 30 }],
  ]);
  const after: TreeSnapshot = new Map([
    ["src/a.ts", { mtimeMs: 1, size: 10 }],
    ["src/b.ts", { mtimeMs: 9, size: 20 }],
    ["src/new.ts", { mtimeMs: 4, size: 40 }],
  ]);
  assert.deepEqual(diffTreeSnapshots(before, after), [
    { path: "src/b.ts", change: "modified" },
    { path: "src/gone.ts", change: "deleted" },
    { path: "src/new.ts", change: "added" },
  ]);
});

test("越界判定：边界内通过；边界外/禁写前缀进入 violations", () => {
  const changes: ShellPostAuditChange[] = [
    { path: "src/a.ts", change: "modified" },
    { path: "other/x.ts", change: "added" },
    { path: ".ans/state/x.json", change: "modified" },
  ];
  const violations = findOutOfBoundChanges({
    changes,
    forbiddenPrefixes: [".ans/"],
    checkWrite: (rel) => ({ allowed: rel.startsWith("src/") }),
  });
  assert.deepEqual(violations.map((v) => v.path), ["other/x.ts", ".ans/state/x.json"], "按输入顺序返回越界清单");
});

test("createShellPostAudit：执行前后快照对比 → 越界写入返回并写审计（仅越界时）；写审计失败不影响回执", async () => {
  const snapshots: TreeSnapshot[] = [
    new Map([["src/a.ts", { mtimeMs: 1, size: 1 }]]),
    new Map([
      ["src/a.ts", { mtimeMs: 2, size: 2 }],
      ["other/evil.ts", { mtimeMs: 3, size: 3 }],
    ]),
  ];
  const records: ShellPostAuditRecord[] = [];
  let index = 0;
  const audit = createShellPostAudit({
    projectRoot: "/proj",
    forbiddenPrefixes: [".ans/"],
    checkWrite: (rel) => ({ allowed: rel.startsWith("src/") }),
    snapshot: async () => snapshots[index++]!,
    auditWriter: (record) => {
      records.push(record);
    },
    now: () => new Date("2026-10-29T00:00:00.000Z"),
  });
  const request = req("call-ok");
  await audit.snapshotBefore(request);
  const result = await audit.auditAfter(request, { exitCode: 0 });
  assert.deepEqual(result.violations, [{ path: "other/evil.ts", change: "added" }], "边界内修改不算越界");
  assert.equal(records.length, 1);
  assert.equal(records[0]!.toolCallId, "call-ok");
  assert.equal(records[0]!.at, "2026-10-29T00:00:00.000Z");
  assert.deepEqual(records[0]!.violations, result.violations);

  // 边界内变化 ⇒ 无 violations、不写审计。
  const clean = createShellPostAudit({
    projectRoot: "/proj",
    forbiddenPrefixes: [],
    checkWrite: (rel) => ({ allowed: rel.startsWith("src/") }),
    snapshot: (() => {
      const seq: TreeSnapshot[] = [
        new Map([["src/a.ts", { mtimeMs: 1, size: 1 }]]),
        new Map([["src/a.ts", { mtimeMs: 5, size: 1 }]]),
      ];
      let i = 0;
      return async () => seq[i++]!;
    })(),
    auditWriter: () => {
      throw new Error("不应写审计");
    },
  });
  const cleanReq = req("call-clean");
  await clean.snapshotBefore(cleanReq);
  assert.deepEqual(await clean.auditAfter(cleanReq, { exitCode: 0 }), { violations: [] });

  // 无快照（快照失败/未调用）⇒ 不审计、不误报。
  const barren = createShellPostAudit({
    projectRoot: "/proj",
    forbiddenPrefixes: [],
    checkWrite: () => ({ allowed: true }),
  });
  assert.deepEqual(await barren.auditAfter(req("call-none"), {}), { violations: [] });
});

test("真实文件系统快照：排除 .ans/.git/node_modules/dist；新增/修改/删除可见", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-post-audit-"));
  try {
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(root, ".ans", "state"), { recursive: true });
    await fs.mkdir(path.join(root, "dist"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "a.ts"), "a", "utf8");
    await fs.writeFile(path.join(root, "node_modules", "pkg", "index.js"), "x", "utf8");
    await fs.writeFile(path.join(root, ".ans", "state", "tasks.jsonl"), "{}\\n", "utf8");
    await fs.writeFile(path.join(root, "dist", "bundle.js"), "x", "utf8");

    const before = await snapshotProjectTree({ projectRoot: root });
    // 2026-10-29 返工（P6）：`.ans/` 不再排除（其变化一律按越界审计）；node_modules/dist 仍排除。
    assert.deepEqual([...before.keys()].sort(), [".ans/state/tasks.jsonl", "src/a.ts"], "排除项不进入快照（.ans 除外）");

    await fs.writeFile(path.join(root, "src", "new.ts"), "n", "utf8");
    await fs.writeFile(path.join(root, "node_modules", "pkg", "index.js"), "changed", "utf8");
    const after = await snapshotProjectTree({ projectRoot: root });
    const changes = diffTreeSnapshots(before, after);
    assert.deepEqual(changes, [{ path: "src/new.ts", change: "added" }], "node_modules 内的变化被排除");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test("P6 返工（R2 审计诚实口径）：`.ans/` 项目内变化按越界记录；审计不宣称覆盖项目外写入", async () => {
  // `.ans/`：即使 checkWrite 错误地全部放行，也必须判越界（项目内可见性）。
  const ansViolations = findOutOfBoundChanges({
    changes: [{ path: ".ans/state/tasks.jsonl", change: "modified" }],
    forbiddenPrefixes: [],
    checkWrite: () => ({ allowed: true }),
  });
  assert.deepEqual(ansViolations, [{ path: ".ans/state/tasks.jsonl", change: "modified" }]);

  // 防御：快照键若出现绝对路径/`..`（不该出现），按越界记录；但项目外写入的拦截由 static guard 与
  // judge 负责，执行后审计**不宣称**覆盖项目外。
  const defensive = findOutOfBoundChanges({
    changes: [{ path: "../outside.txt", change: "added" }, { path: "C:/outside.txt", change: "added" }],
    forbiddenPrefixes: [],
    checkWrite: () => ({ allowed: true }),
  });
  assert.equal(defensive.length, 2);

  // 真实快照只在项目内：`.ans/` 可见（不再排除），node_modules/dist 仍排除。
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-post-audit-root-"));
  try {
    await fs.mkdir(path.join(root, ".ans", "state"), { recursive: true });
    await fs.mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, ".ans", "state", "tasks.jsonl"), "{}\\n", "utf8");
    await fs.writeFile(path.join(root, "node_modules", "pkg", "index.js"), "x", "utf8");
    await fs.writeFile(path.join(root, "src", "a.ts"), "a", "utf8");
    const snapshot = await snapshotProjectTree({ projectRoot: root });
    assert.deepEqual([...snapshot.keys()].sort(), [".ans/state/tasks.jsonl", "src/a.ts"]);
    assert.ok([...snapshot.keys()].every((key) => !key.startsWith("@outside:")));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
