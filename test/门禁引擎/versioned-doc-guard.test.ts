// test/门禁引擎/versioned-doc-guard.test.ts
// 2026-10-29（v2.8 R6/v2.11 R9）：版本化文档只读守卫——既有 -vN.md 覆盖一律 deny；新建 vN+1 允许；
// baseline TOFU/marker/串行登记/canonical 路径。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  acquireVersionLock,
  registerVersionedDocAfterWrite,
  ownsVersionLock,
  isVersionedDocPath,
  recordVersionedDocBaselines,
  releaseVersionLock,
  versionedDocExists,
  versionedDocOverwriteDecision,
  versionedDocVersionOf,
  verifyVersionedDocBaselines,
  VERSION_LOCK_REL,
} from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import { evaluateShellWriteTargets } from "../../src/common/门禁引擎/shell-write-guard.ts";

test("版本化路径识别与版本号：intent/proposal/roster/modules/topology/architecture", () => {
  const paths = [
    "docs/product/focus-intent-v1.md",
    "docs/proposals/focus-proposal-v2.md",
    "docs/proposals/focus-roster-v1.md",
    "docs/proposals/focus-modules-v3.md",
    "docs/proposals/focus-topology-v1.md",
    "docs/contracts/focus-architecture-v2.md",
  ];
  for (const rel of paths) {
    assert.equal(isVersionedDocPath(rel), true, rel);
    assert.ok((versionedDocVersionOf(rel) ?? 0) >= 1, rel);
  }
  assert.equal(isVersionedDocPath("docs/proposals/focus.md"), false);
  assert.equal(isVersionedDocPath("docs/proposals/focus-proposal-v0.md"), false);
  assert.equal(isVersionedDocPath("../docs/product/focus-intent-v1.md"), false);
});

test("覆盖既有版本化文档 ⇒ deny；新建下一版本/非版本化文件 ⇒ allow", () => {
  const existing = versionedDocOverwriteDecision({ relPath: "docs/product/focus-intent-v1.md", exists: true });
  assert.equal(existing.allowed, false);
  if (!existing.allowed) assert.match(existing.reason, /只读|覆盖/);
  assert.equal(versionedDocOverwriteDecision({ relPath: "docs/product/focus-intent-v2.md", exists: false }).allowed, true);
  assert.equal(versionedDocOverwriteDecision({ relPath: "docs/notes.md", exists: true }).allowed, true);
});

test("shell 写目标：既有版本化文档 ⇒ 结构化 deny（不进审批）；新版本放行；脚本 argv 触及时 deny", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-versioned-shell-"));
  try {
    fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "product", "focus-intent-v1.md"), "# v1\n", "utf8");
    const boundary = { entries: [], boundarySource: "<test>", acceptance: { accepted: false, source: "" } };
    const guard = (argv: string[]) =>
      evaluateShellWriteTargets({
        argv,
        cwd: root,
        projectRoot: root,
        skillRoot: root,
        boundary,
        forbiddenPrefixes: [],
        checkWrite: () => ({ allowed: true }),
      });
    const overwrite = guard(["cp", "src/a", "docs/product/focus-intent-v1.md"]);
    assert.equal(overwrite.kind, "deny", JSON.stringify(overwrite));
    if (overwrite.kind === "deny") assert.match(overwrite.reason, /版本化文档只读/);
    const next = guard(["cp", "src/a", "docs/product/focus-intent-v2.md"]);
    assert.equal(next.kind, "pass", JSON.stringify(next));
    const script = guard(["node", "script.js", "docs/product/focus-intent-v1.md"]);
    assert.equal(script.kind, "deny", JSON.stringify(script));
    if (script.kind === "deny") assert.match(script.reason, /版本化文档只读/);
    assert.equal(versionedDocExists(root, "docs/product/focus-intent-v1.md"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("R9 版本基线：TOFU 仅一次；marker 后 baseline 缺失/空/坏行/旧条目缺失 fail-closed 且禁止重建", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-versioned-baseline-"));
  try {
    fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
    const file = path.join(root, "docs/product/focus-intent-v1.md");
    fs.writeFileSync(file, "# v1\n", "utf8");
    const added = await recordVersionedDocBaselines({ projectRoot: root, now: () => new Date("2026-10-29T00:00:00.000Z") });
    assert.equal(added, 1);
    assert.equal(fs.existsSync(path.join(root, ".ans/state/versions.initialized")), true);
    assert.equal(fs.existsSync(path.join(root, ".ans/state/versions.jsonl")), true);
    assert.equal(fs.readdirSync(path.join(root, ".ans/state")).some((name) => name.includes(".tmp-")), false, "原子写不留 tmp");
    assert.equal(fs.readFileSync(path.join(root, ".ans/state/versions.initialized"), "utf8").includes("initializedAt"), true);
    assert.equal((await verifyVersionedDocBaselines({ projectRoot: root })).length, 0);

    // 空 baseline（marker 存在）⇒ fail-closed（不得误判 TOFU）。
    const baselineForEmpty = path.join(root, ".ans/state/versions.jsonl");
    fs.writeFileSync(baselineForEmpty, "", "utf8");
    const empty = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.equal(empty.length, 1);
    assert.equal(empty[0]!.reason, "baseline-corrupt");
    // 恢复原基线继续后续断言。
    fs.writeFileSync(
      baselineForEmpty,
      `${JSON.stringify({ v: 1, flowId: "focus", doc: "intent", version: 1, path: "docs/product/focus-intent", sha256: createHash("sha256").update("# v1\n").digest("hex"), recordedAt: "2026-10-29T00:00:00.000Z", event: "versioned-doc-baseline", recordedBy: "app:test" })}\n`,
      "utf8",
    );

    // 外部修改/删除 ⇒ changed/missing。
    fs.writeFileSync(file, "# v1 modified externally\n", "utf8");
    const changed = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.equal(changed.length, 1);
    assert.equal(changed[0]!.reason, "changed");
    fs.rmSync(file);
    const missing = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.equal(missing.length, 1);
    assert.equal(missing[0]!.reason, "missing");

    // baseline 缺失（marker 仍在）⇒ fail-closed；record 不得重建。
    const baseline = path.join(root, ".ans/state/versions.jsonl");
    fs.rmSync(baseline);
    const noBaseline = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.equal(noBaseline.length, 1);
    assert.equal(noBaseline[0]!.reason, "baseline-missing");
    assert.equal(await recordVersionedDocBaselines({ projectRoot: root }), 0);
    assert.equal(fs.existsSync(baseline), false, "marker 后禁止自动重建 baseline");

    // 坏行 ⇒ baseline-corrupt；record 不得修复。
    fs.writeFileSync(baseline, "{bad json}\n", "utf8");
    const corrupt = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.equal(corrupt.length, 1);
    assert.equal(corrupt[0]!.reason, "baseline-corrupt");
    assert.equal(await recordVersionedDocBaselines({ projectRoot: root }), 0);

    // baseline 存在但 marker 缺失 ⇒ marker-missing fail-closed。
    fs.writeFileSync(baseline, "", "utf8");
    fs.rmSync(path.join(root, ".ans/state/versions.initialized"));
    const noMarker = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.equal(noMarker.length, 1);
    assert.equal(noMarker[0]!.reason, "marker-missing");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("R9 新版本：marker 后新版本首次出现可登记；旧版缺失不补齐", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-versioned-new-"));
  try {
    fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
    const v1 = path.join(root, "docs/product/focus-intent-v1.md");
    const v2 = path.join(root, "docs/product/focus-intent-v2.md");
    fs.writeFileSync(v1, "# v1\n", "utf8");
    await recordVersionedDocBaselines({ projectRoot: root });
    fs.writeFileSync(v2, "version: 2\n# v2\n\n## 版本记录\n- v2\n", "utf8");
    assert.equal(await recordVersionedDocBaselines({ projectRoot: root }), 1, "新版本 v2 首次登记");
    assert.equal((await verifyVersionedDocBaselines({ projectRoot: root })).length, 0);
    // 删除 v1 基线条目（模拟旧条目缺失）⇒ unrecorded，且不得被自动补回。
    const baseline = path.join(root, ".ans/state/versions.jsonl");
    const lines = fs.readFileSync(baseline, "utf8").split("\n").filter((line) => {
      if (line === "") return false;
      const record = JSON.parse(line) as { path: string; version: number };
      return !(record.path === "docs/product/focus-intent" && record.version === 1);
    });
    fs.writeFileSync(baseline, lines.join("\n") + "\n", "utf8");
    const violations = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.ok(violations.some((violation) => violation.path.endsWith("focus-intent-v1.md") && violation.reason === "unrecorded"));
    assert.equal(await recordVersionedDocBaselines({ projectRoot: root }), 0, "旧版缺失不得自动补齐");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v2.11：并发登记不丢 version-added（项目级串行队列）；canonical path 唯一键", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-versioned-concurrent-"));
  try {
    fs.mkdirSync(path.join(root, "docs", "proposals"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs/proposals/focus-proposal-v1.md"), "version: 1\n# v1\n", "utf8");
    await recordVersionedDocBaselines({ projectRoot: root });
    fs.writeFileSync(path.join(root, "docs/proposals/focus-proposal-v2.md"), "version: 2\n# v2\n", "utf8");
    fs.writeFileSync(path.join(root, "docs/proposals/focus-proposal-v3.md"), "version: 3\n# v3\n", "utf8");
    const [a, b] = await Promise.all([
      recordVersionedDocBaselines({ projectRoot: root }),
      recordVersionedDocBaselines({ projectRoot: root }),
    ]);
    assert.equal(a + b, 2, "两个并发写者合计登记 2 个新版本，不丢不重");
    assert.deepEqual(await verifyVersionedDocBaselines({ projectRoot: root }), []);
    const records = fs.readFileSync(path.join(root, ".ans/state/versions.jsonl"), "utf8")
      .split("\n").filter(Boolean).map((line) => JSON.parse(line) as { path: string; version: number });
    assert.equal(records.some((record) => record.path === "docs/proposals/focus-proposal" && record.version === 2), true);
    assert.equal(records.some((record) => record.path === "docs/proposals/focus-proposal" && record.version === 3), true);
    assert.equal(new Set(records.map((record) => `${record.path}|${record.version}`)).size, records.length, "唯一键不重复");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v2.11：v2.10 旧记录（path 含 -vN）读取兼容；canonical 指向文件缺失 ⇒ missing", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-versioned-legacy-"));
  try {
    fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
    fs.mkdirSync(path.join(root, ".ans", "state"), { recursive: true });
    const file = path.join(root, "docs/product/focus-intent-v1.md");
    fs.writeFileSync(file, "# v1\n", "utf8");
    const sha = createHash("sha256").update("# v1\n").digest("hex");
    fs.writeFileSync(
      path.join(root, ".ans/state/versions.jsonl"),
      `${JSON.stringify({ v: 1, flowId: "focus", doc: "intent", version: 1, path: "docs/product/focus-intent-v1.md", sha256: sha, recordedAt: "2026-10-29T00:00:00.000Z", event: "versioned-doc-baseline", recordedBy: "app:test" })}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(root, ".ans/state/versions.initialized"),
      JSON.stringify({ v: 1, initializedAt: "2026-10-29T00:00:00.000Z" }) + "\n",
      "utf8",
    );
    assert.deepEqual(await verifyVersionedDocBaselines({ projectRoot: root }), [], "旧实际路径记录兼容");
    fs.rmSync(file);
    const missing = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.equal(missing.some((violation) => violation.reason === "missing"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v2.12 锁协议：O_EXCL 独占/超时 fail-closed/陈旧接管/只释放自己 token", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-version-lock-"));
  try {
    const release = await acquireVersionLock(root, { timeoutMs: 500 });
    await assert.rejects(() => acquireVersionLock(root, { timeoutMs: 50 }), /锁超时|lock/);
    const lock = JSON.parse(fs.readFileSync(path.join(root, VERSION_LOCK_REL), "utf8")) as { token: string };
    await releaseVersionLock(root, "wrong-token");
    assert.equal(fs.existsSync(path.join(root, VERSION_LOCK_REL)), true, "错误 token 不得释放锁");
    await release();
    assert.equal(fs.existsSync(path.join(root, VERSION_LOCK_REL)), false);
    const release2 = await acquireVersionLock(root, { timeoutMs: 500 });
    await release2();

    // 陈旧锁（pid 不存在 + 超龄）凭 token 接管。
    fs.writeFileSync(
      path.join(root, VERSION_LOCK_REL),
      JSON.stringify({ pid: 99999999, startedAt: "2000-01-01T00:00:00.000Z", token: "stale" }),
      "utf8",
    );
    const release3 = await acquireVersionLock(root, { timeoutMs: 500, staleMs: 1 });
    await release3();
    assert.equal(fs.existsSync(path.join(root, VERSION_LOCK_REL)), false);

    // 活锁（pid 存活）不得按超龄接管：staleMs=1 也必须超时。
    const live = await acquireVersionLock(root, { timeoutMs: 500 });
    await assert.rejects(() => acquireVersionLock(root, { timeoutMs: 50, staleMs: 1 }), /锁超时|lock/);
    await live();

    // token fencing：旧 holder 在锁被替换后不再拥有写权。
    const oldHolder = await acquireVersionLock(root, { timeoutMs: 500 });
    fs.writeFileSync(
      path.join(root, VERSION_LOCK_REL),
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString(), token: "new-holder" }),
      "utf8",
    );
    assert.equal(await ownsVersionLock(root, oldHolder.token), false);
    await oldHolder();
    assert.equal(fs.readFileSync(path.join(root, VERSION_LOCK_REL), "utf8").includes("new-holder"), true, "旧 holder 不得删新锁");

    // 空内容窗口：坏锁不 crash，超时 fail-closed。
    fs.writeFileSync(path.join(root, VERSION_LOCK_REL), "", "utf8");
    await assert.rejects(() => acquireVersionLock(root, { timeoutMs: 50 }), /锁超时|lock/);
    fs.rmSync(path.join(root, VERSION_LOCK_REL), { force: true });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v2.12 旧记录归一化：event/recordedBy/实际 path 只读兼容；非法旧字段整文件 fail", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-versioned-normalize-"));
  try {
    fs.mkdirSync(path.join(root, "docs/proposals"), { recursive: true });
    fs.mkdirSync(path.join(root, ".ans/state"), { recursive: true });
    const file = path.join(root, "docs/proposals/focus-proposal-v1.md");
    fs.writeFileSync(file, "# v1\n", "utf8");
    const sha = createHash("sha256").update("# v1\n").digest("hex");
    const legacy = { v: 1, flowId: "focus", doc: "proposal", version: 1, path: "docs/proposals/focus-proposal-v1.md", sha256: sha, recordedAt: "2026-10-29T00:00:00.000Z", event: "versioned-doc-baseline", recordedBy: "app" };
    const baseline = path.join(root, ".ans/state/versions.jsonl");
    fs.writeFileSync(baseline, `${JSON.stringify(legacy)}\n`, "utf8");
    fs.writeFileSync(path.join(root, ".ans/state/versions.initialized"), JSON.stringify({ v: 1, initializedAt: "2026-10-29T00:00:00.000Z" }) + "\n", "utf8");
    assert.deepEqual(await verifyVersionedDocBaselines({ projectRoot: root }), [], "旧 event/recordedBy/实际 path 归一化后兼容");
    fs.writeFileSync(baseline, `${JSON.stringify({ ...legacy, event: "weird" })}\n`, "utf8");
    const badEvent = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.equal(badEvent.length, 1);
    assert.equal(badEvent[0]!.reason, "baseline-corrupt");
    fs.writeFileSync(baseline, `${JSON.stringify({ ...legacy, path: "docs/proposals/wrong-proposal", event: "baseline" })}\n`, "utf8");
    const badPath = await verifyVersionedDocBaselines({ projectRoot: root });
    assert.equal(badPath.length, 1);
    assert.equal(badPath[0]!.reason, "baseline-corrupt");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v2.13 入口：属主写成功后按单文件登记（TOFU/version-added），不扫描补齐", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-versioned-entry-"));
  try {
    fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
    const v1 = path.join(root, "docs/product/focus-intent-v1.md");
    const v2 = path.join(root, "docs/product/focus-intent-v2.md");
    fs.writeFileSync(v1, "version: 1\n# v1\n\n## 版本记录\n- v1\n", "utf8");
    assert.equal(await registerVersionedDocAfterWrite({ projectRoot: root, absPath: v1, recordedBy: "app:guard" }), true);
    assert.equal(fs.existsSync(path.join(root, ".ans/state/versions.initialized")), true);
    assert.deepEqual(await verifyVersionedDocBaselines({ projectRoot: root }), []);
    fs.writeFileSync(v2, "version: 2\n# v2\n\n## 版本记录\n- v2\n", "utf8");
    const [a, b] = await Promise.all([
      registerVersionedDocAfterWrite({ projectRoot: root, absPath: v2 }),
      registerVersionedDocAfterWrite({ projectRoot: root, absPath: v2 }),
    ]);
    assert.equal(a && b, true);
    const records = fs.readFileSync(path.join(root, ".ans/state/versions.jsonl"), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as { event: string; path: string; version: number });
    assert.equal(records.filter((record) => record.path === "docs/product/focus-intent" && record.version === 2).length, 1, "并发只登记一次");
    assert.equal(records.some((record) => record.version === 2 && record.event === "version-added"), true);
    assert.equal(records.every((record) => (record as { recordedBy?: string }).recordedBy === "app:session"), true, "recordedBy 固定 app:session");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("v2.15 入口预检负例：缺版本记录章节/跳号/旧版已改 ⇒ 不登记", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-versioned-precheck-"));
  try {
    fs.mkdirSync(path.join(root, "docs", "product"), { recursive: true });
    const v1 = path.join(root, "docs/product/focus-intent-v1.md");
    fs.writeFileSync(v1, "version: 1\n# v1\n\n## 版本记录\n- v1\n", "utf8");
    assert.equal(await registerVersionedDocAfterWrite({ projectRoot: root, absPath: v1 }), true);
    const noHistory = path.join(root, "docs/product/focus-intent-v2.md");
    fs.writeFileSync(noHistory, "# missing version header\n", "utf8");
    assert.equal(await registerVersionedDocAfterWrite({ projectRoot: root, absPath: noHistory }), false, "缺版本记录章节");
    const skip = path.join(root, "docs/product/focus-intent-v3.md");
    fs.writeFileSync(skip, "version: 3\n# v3\n\n## 版本记录\n- v3\n", "utf8");
    assert.equal(await registerVersionedDocAfterWrite({ projectRoot: root, absPath: skip }), false, "跳号 N+2");
    fs.writeFileSync(v1, "version: 1\n# changed\n\n## 版本记录\n- v1\n", "utf8");
    const v2 = path.join(root, "docs/product/focus-intent-v2.md");
    fs.writeFileSync(v2, "version: 2\n# v2\n\n## 版本记录\n- v2\n", "utf8");
    assert.equal(await registerVersionedDocAfterWrite({ projectRoot: root, absPath: v2 }), false, "旧版已改不得登记");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("2026-10-30（3.1/Delta-W1-1）：assets 作为第七类 vN 文档纳入只读守卫", () => {
  assert.equal(isVersionedDocPath("docs/contracts/focus-assets-v1.md"), true);
  assert.equal(versionedDocVersionOf("docs/contracts/focus-assets-v2.md"), 2);
  const deny = versionedDocOverwriteDecision({ relPath: "docs/contracts/focus-assets-v1.md", exists: true });
  assert.equal(deny.allowed, false);
  const allow = versionedDocOverwriteDecision({ relPath: "docs/contracts/focus-assets-v2.md", exists: false });
  assert.equal(allow.allowed, true);
});
