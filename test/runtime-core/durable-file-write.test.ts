import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { wasWrittenByTool } from "../../src/common/编排/write-journal.ts";
import type { ClaimFileWriteFn, FileGateFacts, FileWriteClaimOutcome, GovernedToolsOptions, WriteGate } from "../../src/model/runtime.ts";
import { buildGovernedTools, inspectFileGateContext } from "../../src/provider/runtime/tools.ts";
import { allow } from "./fixtures.ts";

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

async function withRoot(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "ans-durable-file-write-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function hostOptions(root: string): GovernedToolsOptions {
  return {
    writeRoot: root,
    projectRoot: root,
    skillRoot: root,
    fileGateProtocol: "host-facts-v1",
    fileGateProtection: {
      projectRoot: root,
      coverage: "complete",
      basisDigest: sha256("test host protection observation"),
      protectedGitRoots: [],
      reasons: [],
    },
  };
}

function inspectingGate(observe?: (facts: FileGateFacts) => void): WriteGate {
  return (target, context) => {
    assert.ok(context?.operation && context.stage);
    const facts = inspectFileGateContext(context, target, context.operation, context.stage);
    assert.ok(facts);
    observe?.(facts);
    return allow(target);
  };
}

function handler(name: "write_file" | "edit_file", options: GovernedToolsOptions, gate = inspectingGate()) {
  return buildGovernedTools(gate, options).find(tool => tool.name === name)!.handler;
}

test("a stale or blocked claim denies real writes before any parent directory is created", async () => {
  await withRoot(async root => {
    for (const code of ["attempt-stale", "attempt-blocked"]) {
      const target = join(root, code);
      const result = await handler("write_file", {
        ...hostOptions(root),
        claimFileWrite: async () => ({ ok: false, code, message: "no effective write claim" }),
      })({ name: "write_file", args: { path: join(target, "doc.txt"), content: "unexpected" } });
      assert.equal(result.ok, false);
      assert.match(result.message, new RegExp(code));
      await assert.rejects(access(target), { code: "ENOENT" });
    }
    const target = join(root, "existing.txt");
    await writeFile(target, "original");
    const edit = await handler("edit_file", {
      ...hostOptions(root),
      claimFileWrite: async () => ({ ok: false, code: "attempt-stale", message: "failed to claim edit" }),
    })({ name: "edit_file", args: { path: target, old_string: "original", new_string: "unexpected" } });
    assert.equal(edit.ok, false);
    assert.match(edit.message, /attempt-stale/);
    assert.equal(await readFile(target, "utf8"), "original");
  });
});

test("an old write paused at acquisition cannot write after the current attempt changes", async () => {
  await withRoot(async root => {
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    let activeAttempt = 1;
    let finalChecks = 0;
    const claimFileWrite: ClaimFileWriteFn = async () => {
      entered.resolve();
      await resume.promise;
      assert.equal(activeAttempt, 2);
      return { ok: false, code: "attempt-stale", message: "attempt replaced while waiting" };
    };
    const pending = handler("write_file", { ...hostOptions(root), claimFileWrite }, inspectingGate(facts => {
      if (facts.stage === "final-write") finalChecks++;
    }))({ name: "write_file", args: { path: "nested/doc.txt", content: "old content" } });
    await Promise.race([entered.promise, pending.then(result => assert.fail(result.message))]);
    try {
      await assert.rejects(access(join(root, "nested")), { code: "ENOENT" });
      activeAttempt = 2;
    } finally {
      resume.resolve();
    }
    const result = await pending;
    assert.match(result.message, /attempt-stale/);
    assert.equal(result.ok, false);
    assert.equal(finalChecks, 0);
    await assert.rejects(access(join(root, "nested")), { code: "ENOENT" });
  });
});

test("write_file and edit_file claim host-issued IDs and actual bytes and finish after write audit", async () => {
  await withRoot(async root => {
    const target = join(root, "nested", "doc.txt");
    const signal = new AbortController().signal;
    const seenIds = new Set<string>();
    const before = Date.now();
    for (const operation of ["write", "edit"] as const) {
      const name = operation === "write" ? "write_file" : "edit_file";
      const content = operation === "write" ? "\uFEFF旧内容\r\n" : "\uFEFF新内容\r\n";
      const stages: FileGateFacts[] = [];
      const order: string[] = [];
      const run = handler(name, {
        ...hostOptions(root),
        claimFileWrite: async input => {
          order.push("claim");
          assert.deepEqual(stages.map(facts => facts.stage), ["lexical-read", "canonical-read"]);
          assert.match(input.operationId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
          assert.deepEqual(input, { operationId: stages[0]!.operationId, targetPath: target,
            operation, contentSha256: sha256(content), signal });
          seenIds.add(input.operationId);
          if (operation === "write") await assert.rejects(access(join(root, "nested")), { code: "ENOENT" });
          return { ok: true, value: { async finish(outcome, evidence) {
            order.push("finish");
            assert.equal(outcome, "succeeded");
            assert.ok(evidence.includes(target));
            assert.equal(await readFile(target, "utf8"), content);
            assert.equal(wasWrittenByTool(target, sha256(content), before), true);
          } } };
        },
        versionedDocAfterWrite: async path => {
          order.push("version audit");
          assert.equal(path, target);
          assert.equal(await readFile(target, "utf8"), content);
        },
      }, inspectingGate(facts => {
        stages.push(facts);
        if (facts.stage === "final-write") order.push("final gate");
      }));
      const args = operation === "write"
        ? { path: target, content }
        : { path: target, old_string: "旧内容\r\n", new_string: "新内容\r\n" };
      const result = await run({ name, args, signal });
      assert.equal(result.ok, true, result.message);
      assert.deepEqual(order, ["claim", "final gate", "version audit", "finish"]);
      const final = stages[2];
      assert.equal(final?.stage, "final-write");
      assert.equal(final?.operationId, stages[0]?.operationId);
      assert.equal(final?.contentSha256, sha256(content));
    }
    assert.equal(seenIds.size, 2);
  });
});

test("cancellation during claim records not-started; a failed audit after writing records unknown", async () => {
  await withRoot(async root => {
    const controller = new AbortController();
    const outcomes: FileWriteClaimOutcome[] = [];
    const claimFileWrite: ClaimFileWriteFn = async () => {
      controller.abort();
      return { ok: true, value: { async finish(outcome) { outcomes.push(outcome); } } };
    };
    const cancelled = await handler("write_file", { ...hostOptions(root), claimFileWrite })({
      name: "write_file", args: { path: "cancelled/doc.txt", content: "unexpected" }, signal: controller.signal,
    });
    assert.equal(cancelled.ok, false);
    await assert.rejects(access(join(root, "cancelled")), { code: "ENOENT" });

    const target = join(root, "doc.txt");
    await writeFile(target, "original");
    const uncertain = await handler("edit_file", {
      ...hostOptions(root),
      claimFileWrite,
      versionedDocAfterWrite: async () => { throw new Error("audit unavailable"); },
    })({ name: "edit_file", args: { path: target, old_string: "original", new_string: "edited" } });
    assert.equal(uncertain.ok, false);
    assert.match(uncertain.message, /audit unavailable/);
    assert.equal(await readFile(target, "utf8"), "edited");
    assert.deepEqual(outcomes, ["not-started", "unknown"]);
  });
});

test("a failed claim callback fails closed and an unconfirmed finish never reports write success", async () => {
  await withRoot(async root => {
    const target = join(root, "doc.txt");
    const missingHost = await handler("write_file", {
      writeRoot: root,
      claimFileWrite: async () => { throw new Error("should not reach claim without host facts"); },
    })({ name: "write_file", args: { path: target, content: "unexpected" } });
    assert.match(missingHost.message, /host-facts-v1/);
    assert.equal(missingHost.ok, false);

    const failed = await handler("write_file", {
      ...hostOptions(root),
      claimFileWrite: async () => { throw new Error("claim unavailable"); },
    })({ name: "write_file", args: { path: target, content: "unexpected" } });
    assert.match(failed.message, /claim unavailable/);
    assert.equal(failed.ok, false);
    await assert.rejects(access(target), { code: "ENOENT" });

    const outcomes: FileWriteClaimOutcome[] = [];
    const unconfirmed = await handler("write_file", {
      ...hostOptions(root),
      claimFileWrite: async () => ({ ok: true, value: { async finish(outcome) {
        outcomes.push(outcome);
        throw new Error("receipt unavailable");
      } } }),
    })({ name: "write_file", args: { path: target, content: "effect reached disk" } });
    assert.match(unconfirmed.message, /receipt unavailable/);
    assert.equal(unconfirmed.ok, false);
    assert.equal(await readFile(target, "utf8"), "effect reached disk");
    assert.deepEqual(outcomes, ["succeeded"]);
  });
});
