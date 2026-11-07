// C1c：WriteGate 内容上下文（关闭 C1 冻结遗留 F6；P1 r2 §3.3-8）。
// R18 / 已确认G-T1.2：维护R16真实内容首probe/host-only edit只读阶段；最终许可/安全断言保持。
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, renameSync, symlinkSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile, link, symlink, readdir } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import { isRuntimeEditReadProbe, inspectRuntimeFileGateContext } from "../../src/service/runtime/session.ts";
import { resolveWriteReadPreflight, resolveWriteFinal, stableWriteDecisionFromFacts } from "../../src/service/gate/resolve-write.ts";
import { installStableWritePermitSnapshot, invalidateStableWritePermitSnapshot } from "../../src/common/门禁引擎/versioned-doc-guard.ts";
import type { StableWritePermit } from "../../src/model/version-change.ts";
import type { WriteGate, WriteGateContext, WriteGateOperation, GovernedToolsOptions, FileGateFacts } from "../../src/model/runtime.ts";
import type { BoundarySection1 } from "../../src/model/boundary.ts";
import { allow } from "./fixtures.ts";

const sha256 = (data: Buffer): string => createHash("sha256").update(data).digest("hex");

const toolsFor = (root: string, gate: WriteGate) =>
  new Map(buildGovernedTools(gate, { writeRoot: root }).map((tool) => [tool.name, tool]));

async function withRoot(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), "ans-write-gate-context-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("F6/write_file：首次与写前复核均收到真实最终字节 sha256 与 operation=write", async () => {
  await withRoot(async (root) => {
    const content = "第一行\n第二行\n";
    const seen: Array<WriteGateContext | undefined> = [];
    const gate: WriteGate = (target, context) => {
      seen.push(context);
      return allow(target);
    };
    const result = await toolsFor(root, gate).get("write_file")!.handler({
      name: "write_file",
      args: { path: "nested/file.txt", content },
    });
    assert.equal(result.ok, true, result.message);
    assert.equal(await readFile(path.join(root, "nested", "file.txt"), "utf8"), content);
    assert.equal(seen.length, 2);
    assert.deepEqual(seen[0], { contentSha256: sha256(Buffer.from(content, "utf8")), operation: "write" }, "首次即核真实最终字节，不能让稳定许可先看到空hash");
    assert.deepEqual(seen[1], { contentSha256: sha256(Buffer.from(content, "utf8")), operation: "write" });
    assert.match(seen[1]!.contentSha256!, /^[0-9a-f]{64}$/);
  });
});

test("F6/edit_file：写前复核 gate 收到编辑后最终字节（BOM 保留）sha256 与 operation=edit", async () => {
  await withRoot(async (root) => {
    await writeFile(path.join(root, "doc.txt"), "\uFEFF" + "original", "utf8");
    const expected = Buffer.from("\uFEFF" + "changed", "utf8");
    const seen: Array<WriteGateContext | undefined> = [];
    const gate: WriteGate = (target, context) => {
      seen.push(context);
      return allow(target);
    };
    const result = await toolsFor(root, gate).get("edit_file")!.handler({
      name: "edit_file",
      args: { path: "doc.txt", old_string: "original", new_string: "changed" },
    });
    assert.equal(result.ok, true, result.message);
    assert.deepEqual(await readFile(path.join(root, "doc.txt")), expected);
    assert.equal(seen.length, 2);
    assert.deepEqual(seen[0], { phase: "edit-read", operation: "edit" }, "首次仅受信路径/读取阶段，不能冒最终写许可");
    assert.equal(isRuntimeEditReadProbe(seen[0], path.join(root, "doc.txt")), true);
    assert.equal(isRuntimeEditReadProbe({ ...seen[0] }, path.join(root, "doc.txt")), false);
    assert.equal(isRuntimeEditReadProbe(seen[0], path.join(root, "other.txt")), false);
    assert.equal(seen[0]!.contentSha256, undefined);
    assert.deepEqual(seen[1], { contentSha256: sha256(expected), operation: "edit" });
  });
});

test("F6/向后兼容：旧单参数 WriteGate 实现与直接单参调用零变化", async () => {
  await withRoot(async (root) => {
    const oldStyle: WriteGate = (target) => allow(target);
    assert.equal(oldStyle("any/path").allowed, true, "直接单参数调用保持可用");
    const result = await toolsFor(root, oldStyle).get("write_file")!.handler({
      name: "write_file",
      args: { path: "legacy.txt", content: "legacy" },
    });
    assert.equal(result.ok, true, result.message);
    assert.equal(await readFile(path.join(root, "legacy.txt"), "utf8"), "legacy");
  });
});

test("F6/写前复核拒绝：携带内容上下文时拒绝 ⇒ write/edit 均不落盘", async () => {
  await withRoot(async (root) => {
    await writeFile(path.join(root, "existing.txt"), "original", "utf8");
    const gate: WriteGate = (target, context) => {
      if (context?.contentSha256 !== undefined) {
        return { allowed: false, reason: "stable-write 许可缺失（fixture）", allowedByRoot: { project: [], skill: [] } };
      }
      return allow(target);
    };
    const byName = toolsFor(root, gate);
    const write = await byName.get("write_file")!.handler({
      name: "write_file",
      args: { path: "created/file.txt", content: "changed" },
    });
    assert.equal(write.ok, false);
    assert.match(write.message, /stable-write 许可缺失/);
    assert.equal(existsSync(path.join(root, "created", "file.txt")), false, "拒绝时不得创建目标文件");
    const edit = await byName.get("edit_file")!.handler({
      name: "edit_file",
      args: { path: "existing.txt", old_string: "original", new_string: "changed" },
    });
    assert.equal(edit.ok, false);
    assert.match(edit.message, /stable-write 许可缺失/);
    assert.equal(await readFile(path.join(root, "existing.txt"), "utf8"), "original", "拒绝时原文件保持不变");
  });
});

test("F6/类型形状：纯phase型不是读取/写入权限，最终hash与operation保持", () => {
  const empty: WriteGateContext = {};
  const write: WriteGateContext = { contentSha256: "0".repeat(64), operation: "write" };
  const edit: WriteGateContext = { operation: "edit" };
  const read: WriteGateContext = { phase: "edit-read", operation: "edit" };
  assert.equal(isRuntimeEditReadProbe(read, "forged-path"), false);
  const operations: WriteGateOperation[] = ["write", "edit"];
  assert.deepEqual(Object.keys(empty), []);
  assert.equal(write.operation, "write");
  assert.equal(edit.operation, "edit");
  assert.deepEqual(operations, ["write", "edit"]);
  // @ts-expect-error operation 仅 write/edit
  const invalid: WriteGateOperation = "append";
  // @ts-expect-error 未定义字段不得进入上下文（不扩大写集/判定面）
  const extra: WriteGateContext = { contentSha256: "0".repeat(64), stablePermit: "forged" };
  assert.equal(typeof invalid, "string");
  assert.equal("stablePermit" in extra, true);
});

// Synthetic host observations isolate Provider issuance/policy ordering, not production repo discovery proof.
function stagedOptions(root: string): GovernedToolsOptions {
  return { projectRoot: root, skillRoot: root, writeRoot: root, fileGateProtocol: "host-facts-v1",
    fileGateProtection: { projectRoot: root, protectedGitRoots: [path.join(root, ".git")], coverage: "complete",
      basisDigest: sha256(Buffer.from("owned-unit-host-observation")), reasons: [] } };
}
const refused = (reason: string) => ({ allowed: false as const, reason, allowedByRoot: { project: [], skill: [] } });
function pureStagedGate(root: string, observe?: (facts: FileGateFacts, context: WriteGateContext) => ReturnType<WriteGate> | void): WriteGate {
  const boundary: BoundarySection1 = { entries: [{ root: "project", path: "allowed", kind: "directory", purpose: "owned fixture" }],
    boundarySource: "accepted-unit-boundary", acceptance: { accepted: true, source: "accepted-unit-boundary" } };
  const scope = { writeSet: ["allowed/new.txt", "allowed/doc.txt", "allowed/hard.txt", "allowed/parent/new.txt", "allowed/alias/secret.txt"], conditions: [] };
  return (target, context) => {
    if (!context?.stage || !context.operation) return refused("host facts required; no legacy fallback");
    const facts = inspectRuntimeFileGateContext(context, target, context.operation, context.stage);
    if (!facts) return refused("issued host identity unavailable");
    const extra = observe?.(facts, context);
    if (extra) return extra;
    return facts.stage === "final-write" ? resolveWriteFinal(target, boundary, scope, facts) : resolveWriteReadPreflight(target, boundary, scope, facts);
  };
}
const stagedTools = (options: GovernedToolsOptions, gate: WriteGate) => new Map(buildGovernedTools(gate, options).map(tool => [tool.name, tool]));

test("R20 issued stages bind invocation/path/op/stage, expire on gate return, and write only after pure final policy", async () => {
  await withRoot(async root => {
    const target = path.join(root, "allowed", "new.txt"), contexts: WriteGateContext[] = [], observed: FileGateFacts[] = [];
    const gate = pureStagedGate(root, (facts, context) => {
      contexts.push(context); observed.push(facts);
      assert.equal(Object.isFrozen(context), true); assert.equal(Object.isFrozen(context.fileFacts), true);
      assert.equal(inspectRuntimeFileGateContext({ ...context }, target, facts.operation, facts.stage), undefined);
      assert.equal(inspectRuntimeFileGateContext(context, `${target}.other`, facts.operation, facts.stage), undefined);
      assert.equal(inspectRuntimeFileGateContext(context, target, facts.operation === "write" ? "edit" : "write", facts.stage), undefined);
      assert.equal(inspectRuntimeFileGateContext(context, target, facts.operation, facts.stage === "final-write" ? "canonical-read" : "final-write"), undefined);
      if (facts.canonicalFacts) {
        assert.equal(Object.isFrozen(context.fileFacts!.canonicalFacts!.protectedRoots), true);
        facts.canonicalFacts.protectedRoots = [];
        assert.deepEqual(inspectRuntimeFileGateContext(context, target, facts.operation, facts.stage)!.canonicalFacts!.protectedRoots, [path.join(root, ".git")]);
      }
    });
    const result = await stagedTools(stagedOptions(root), gate).get("write_file")!.handler({ name: "write_file", args: { path: "allowed/new.txt", content: "exact final bytes\n" } });
    assert.equal(result.ok, true, result.message); assert.equal(await readFile(target, "utf8"), "exact final bytes\n");
    assert.deepEqual(observed.map(f => f.stage), ["lexical-read", "canonical-read", "final-write"]);
    assert.equal(new Set(observed.map(f => f.invocationId)).size, 1); assert.equal(new Set(observed.map(f => f.operationId)).size, 1);
    const final = observed[2]; assert.equal(final.stage, "final-write");
    if (final.stage === "final-write") { assert.deepEqual(final.currentFile, { state: "missing" }); assert.equal(final.contentSha256, sha256(Buffer.from("exact final bytes\n"))); }
    for (const context of contexts) assert.equal(inspectRuntimeFileGateContext(context, target, "write", context.stage!), undefined, "expired objects cannot replay");
  });
});

test("R20 authorized stable edit preserves BOM, exact current SHA and permit base/final SHA policy", async () => {
  await withRoot(async root => {
    await mkdir(path.join(root, "allowed")); const file = path.join(root, "allowed", "workflow.md");
    const old = Buffer.from("\uFEFForiginal\r\n"), next = Buffer.from("\uFEFFchanged\r\n"); await writeFile(file, old);
    // Stable's actual registered path must be docs/workflow.md; use a second real boundary for this case.
    await mkdir(path.join(root, "docs")); const stable = path.join(root, "docs", "workflow.md"); await writeFile(stable, old);
    const permit: StableWritePermit = { v: 1, schema: "stable-write/v1", permitId: "r20-owned-permit", requestId: "r20-owned-request", roleId: "convener",
      kind: "workflow", path: "docs/workflow.md", baseSha256: sha256(old), targetSha256: sha256(next), status: "approved", authority: { decisionId: "unit-actual-installed-snapshot" },
      approvedAt: "2026-11-06T01:00:00.000Z", issuedAt: "2026-11-06T01:00:00.000Z", expiresAt: "2026-11-06T01:20:00.000Z" };
    installStableWritePermitSnapshot(root, [permit]);
    const seen: FileGateFacts[] = [];
    const boundary: BoundarySection1 = { entries: [{ root: "project", path: "docs/workflow.md", kind: "file", purpose: "stable unit" }], boundarySource: "unit", acceptance: { accepted: true, source: "unit" } };
    const gate: WriteGate = (target, context) => {
      const facts = context?.stage && context.operation ? inspectRuntimeFileGateContext(context, target, context.operation, context.stage) : undefined;
      if (!facts) return refused("missing host identity"); seen.push(facts);
      if (facts.stage !== "final-write") return resolveWriteReadPreflight(target, boundary, { writeSet: ["docs/workflow.md"], conditions: [] }, facts);
      const decision = stableWriteDecisionFromFacts({ projectRoot: root, relPath: permit.path, sha256: facts.contentSha256, currentFile: facts.currentFile, permit, now: () => new Date("2026-11-06T01:10:00.000Z") });
      assert.equal(stableWriteDecisionFromFacts({ projectRoot: root, relPath: permit.path, sha256: sha256(Buffer.from("changed\r\n")), currentFile: facts.currentFile, permit }).allowed, false);
      return decision.allowed ? resolveWriteFinal(target, boundary, { writeSet: ["docs/workflow.md"], conditions: [] }, facts) : refused("strict stable permit mismatch");
    };
    try {
      const result = await stagedTools(stagedOptions(root), gate).get("edit_file")!.handler({ name: "edit_file", args: { path: "docs/workflow.md", old_string: "original", new_string: "changed" } });
      assert.equal(result.ok, true, result.message); assert.deepEqual(await readFile(stable), next);
      const final = seen.find(f => f.stage === "final-write")!; assert.equal(final.stage, "final-write");
      if (final.stage === "final-write") { assert.deepEqual(final.currentFile, { state: "present", sha256: sha256(old) }); assert.equal(final.contentSha256, sha256(next)); }
    } finally { invalidateStableWritePermitSnapshot(root); }
  });
});

test("R20 unapproved lexical/canonical paths, unknown coverage, legacy consumers and I/O failures never read unauthorized bytes", async () => {
  await withRoot(async root => {
    await mkdir(path.join(root, "allowed")); await mkdir(path.join(root, "private"));
    const file = path.join(root, "allowed", "doc.txt"), secret = path.join(root, "private", "secret.txt");
    await writeFile(file, "original"); await writeFile(secret, "secret"); await symlink(path.join(root, "private"), path.join(root, "allowed", "alias"), "junction");
    const fs = createRequire(import.meta.url)("node:fs/promises") as typeof import("node:fs/promises"); const original = fs.readFile;
    let reads = 0, fault = false;
    fs.readFile = ((...args: Parameters<typeof original>) => {
      if ([file, secret, path.join(root, "allowed", "alias", "secret.txt")].includes(String(args[0]))) { reads++; if (fault) return Promise.reject(Object.assign(Error("owned EIO"), { code: "EIO" })); }
      return original(...args);
    }) as typeof original; syncBuiltinESMExports();
    try {
      for (const name of ["write_file", "edit_file"]) {
        const args = { path: "private/secret.txt", content: "bad", old_string: "secret", new_string: "bad" };
        assert.equal((await stagedTools(stagedOptions(root), pureStagedGate(root)).get(name)!.handler({ name, args })).ok, false);
        assert.equal((await stagedTools(stagedOptions(root), pureStagedGate(root)).get(name)!.handler({ name, args: { ...args, path: "allowed/alias/secret.txt" } })).ok, false);
        const unknown = stagedOptions(root); unknown.fileGateProtection!.coverage = "unknown";
        assert.equal((await stagedTools(unknown, pureStagedGate(root)).get(name)!.handler({ name, args: { ...args, path: "allowed/doc.txt" } })).ok, false);
        assert.equal((await stagedTools(stagedOptions(root), allow).get(name)!.handler({ name, args: { ...args, path: "allowed/doc.txt" } })).ok, false, "old allow cannot authorize staged reads");
      }
      assert.equal(reads, 0);
      fault = true;
      const result = await stagedTools(stagedOptions(root), pureStagedGate(root)).get("write_file")!.handler({ name: "write_file", args: { path: "allowed/doc.txt", content: "bad" } });
      assert.equal(result.ok, false); assert.match(result.message, /current file unknown/); assert.equal(reads, 1, "EIO is not missing");
    } finally { fs.readFile = original; syncBuiltinESMExports(); }
    assert.equal(await readFile(file, "utf8"), "original"); assert.equal(await readFile(secret, "utf8"), "secret");
  });
});

test("R20 host drift, final base drift, hardlinks and canonical parent replacement fail without commit", async () => {
  await withRoot(async root => {
    await mkdir(path.join(root, "allowed")); await mkdir(path.join(root, "private"));
    const file = path.join(root, "allowed", "doc.txt"); await writeFile(file, "original");
    const fs = createRequire(import.meta.url)("node:fs");
    const options = stagedOptions(root);
    let drifted = false;
    const drift = pureStagedGate(root, facts => { if (facts.stage === "canonical-read") { options.fileGateProtection!.basisDigest = "e".repeat(64); drifted = true; } });
    assert.equal((await stagedTools(options, drift).get("write_file")!.handler({ name: "write_file", args: { path: "allowed/doc.txt", content: "bad" } })).ok, false); assert.equal(drifted, true);
    const baseDrift = pureStagedGate(root, facts => { if (facts.stage === "final-write") fs.writeFileSync(file, "concurrent real writer"); });
    const baseResult = await stagedTools(stagedOptions(root), baseDrift).get("write_file")!.handler({ name: "write_file", args: { path: "allowed/doc.txt", content: "bad" } });
    assert.equal(baseResult.ok, false); assert.match(baseResult.message, /current file changed/); assert.equal(await readFile(file, "utf8"), "concurrent real writer");
    await writeFile(file, "original"); const alias = path.join(root, "allowed", "hard.txt"); await link(file, alias);
    assert.equal((await stagedTools(stagedOptions(root), pureStagedGate(root)).get("edit_file")!.handler({ name: "edit_file", args: { path: "allowed/hard.txt", old_string: "original", new_string: "bad" } })).ok, false);
    assert.equal(await readFile(file, "utf8"), "original");
    await mkdir(path.join(root, "allowed", "parent")); await writeFile(path.join(root, "private", "new.txt"), "private original");
    const replace = pureStagedGate(root, facts => { if (facts.stage === "final-write") { renameSync(path.join(root, "allowed", "parent"), path.join(root, "allowed", "saved")); symlinkSync(path.join(root, "private"), path.join(root, "allowed", "parent"), "junction"); } });
    const swapped = await stagedTools(stagedOptions(root), replace).get("write_file")!.handler({ name: "write_file", args: { path: "allowed/parent/new.txt", content: "bad" } });
    assert.equal(swapped.ok, false); assert.equal(await readFile(path.join(root, "private", "new.txt"), "utf8"), "private original");
  });
});

test("R20 final deny and real rename failure preserve target bytes and remove only the owned temp", async () => {
  await withRoot(async root => {
    await mkdir(path.join(root, "allowed")); const target = path.join(root, "allowed", "doc.txt"); await writeFile(target, "original");
    const deny = pureStagedGate(root, facts => facts.stage === "final-write" ? refused("final permit revoked") : undefined);
    assert.equal((await stagedTools(stagedOptions(root), deny).get("write_file")!.handler({ name: "write_file", args: { path: "allowed/doc.txt", content: "bad" } })).ok, false);
    const fs = createRequire(import.meta.url)("node:fs/promises") as typeof import("node:fs/promises"); const original = fs.rename;
    let renames = 0; fs.rename = (async (...args: Parameters<typeof original>) => { if (String(args[1]) === target) { renames++; throw Object.assign(Error("owned rename failure"), { code: "EIO" }); } return original(...args); }) as typeof original; syncBuiltinESMExports();
    try {
      const result = await stagedTools(stagedOptions(root), pureStagedGate(root)).get("write_file")!.handler({ name: "write_file", args: { path: "allowed/doc.txt", content: "bad" } });
      assert.equal(result.ok, false); assert.match(result.message, /owned rename failure/); assert.equal(renames, 1);
    } finally { fs.rename = original; syncBuiltinESMExports(); }
    assert.equal(await readFile(target, "utf8"), "original"); assert.deepEqual(await readdir(path.join(root, "allowed")), ["doc.txt"]);
  });
});

test("R20 production schema/raw refuse staged host fields before gate, while legacy nonmanaged calls keep old behavior", async () => {
  await withRoot(async root => {
    let calls = 0; const gate: WriteGate = target => { calls++; return allow(target); };
    const tools = stagedTools(stagedOptions(root), gate);
    for (const name of ["write_file", "edit_file"]) {
      const tool = tools.get(name)!;
      const schema = tool.inputSchema as { properties: Record<string, unknown>; not: { anyOf: { required: string[] }[] } };
      for (const key of ["stage", "fileFacts", "invocationId", "operationId", "projectRoot", "skillRoot", "canonicalFacts", "currentFile", "fileGateProtocol", "fileGateProtection",
        "targetPath", "canonical", "protectedRoots", "coverage", "basisDigest", "reasons", "roots"]) {
        assert.equal(key in schema.properties, false); assert.ok(schema.not.anyOf.some(rule => rule.required[0] === key));
        const result = await tool.handler({ name, args: { path: "allowed/doc.txt", content: "bad", old_string: "original", new_string: "bad", [key]: undefined } });
        assert.equal(result.ok, false); assert.match(result.message, /host-only/);
      }
    }
    assert.equal(calls, 0);
    const legacy = await toolsFor(root, gate).get("write_file")!.handler({ name: "write_file", args: { path: "legacy.txt", content: "actual legacy bytes" } });
    assert.equal(legacy.ok, true, legacy.message); assert.equal(await readFile(path.join(root, "legacy.txt"), "utf8"), "actual legacy bytes");
  });
});
