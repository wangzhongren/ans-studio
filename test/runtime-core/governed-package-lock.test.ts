import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, link, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { FileGateFacts, GovernedToolsOptions, WriteGate } from "../../src/model/runtime.ts";
import { buildGovernedTools, inspectFileGateContext } from "../../src/provider/runtime/tools.ts";
import { allow } from "./fixtures.ts";

const name = "generate_package_lock";
const request = { name, args: {}, toolCallId: "test-tool-call" };
const manifest = { name: "test-racing", version: "1.0.0", dependencies: { three: "^0.181.2" } };
const source = { ...manifest, scripts: { postinstall: "not passed to the generator" }, publishConfig: { registry: "https://private.example" } };
const artifact = { version: "0.181.2", resolved: "https://registry.npmjs.org/three/-/three-0.181.2.tgz", integrity: "sha512-ZXhhbXBsZQ==" };
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const candidate = (entry: object = artifact) => json({
  name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: { "": manifest, "node_modules/three": entry },
});

function inspectingGate(inspect?: (facts: FileGateFacts) => void): WriteGate {
  return (target, context) => {
    assert.ok(context?.operation && context.stage);
    const facts = inspectFileGateContext(context, target, context.operation, context.stage);
    assert.ok(facts);
    inspect?.(facts);
    return allow(target);
  };
}

async function fixture(run: (root: string, options: GovernedToolsOptions) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "ans-governed-package-lock-"));
  try {
    await writeFile(join(root, "package.json"), json(source));
    await run(root, {
      projectRoot: root, skillRoot: root, writeRoot: root, durableFixedWorkflow: true, fileGateProtocol: "host-facts-v1",
      currentTurnId: () => "test-turn",
      fileGateProtection: { projectRoot: root, coverage: "complete", basisDigest: sha256(json("host protection")), protectedGitRoots: [], reasons: [] },
      claimFileWrite: async () => ({ ok: true, value: { async finish() {} } }),
      governedPackageLock: {
        authorize: async () => ({ isCurrent: () => true }),
        generate: async () => ({ ok: true, value: candidate() }),
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function tool(options: GovernedToolsOptions, gate = inspectingGate()) {
  return buildGovernedTools(gate, options).find(entry => entry.name === name);
}

test("only wired durable sessions advertise the no-argument tool or call the runner after live gate checks", async () => {
  await fixture(async (root, options) => {
    for (const override of [{ durableFixedWorkflow: false }, { governedPackageLock: undefined }, { claimFileWrite: undefined }, { fileGateProtocol: undefined }, { writeRoot: join(root, "foreign") }, { currentTurnId: undefined }]) {
      assert.equal(tool({ ...options, ...override }), undefined);
    }
    let authorization = 0;
    let generation = 0;
    const port: NonNullable<GovernedToolsOptions["governedPackageLock"]> = {
      authorize: async () => { authorization++; return undefined; },
      generate: async () => { generation++; return { ok: true as const, value: candidate() }; },
    };
    const wired = { ...options, governedPackageLock: port };
    const action = tool(wired)!;
    assert.deepEqual(action.inputSchema, { type: "object", properties: {}, additionalProperties: false });
    assert.equal(action.executionMode, "sequential");
    assert.equal((await action.handler({ name, args: { path: "other.json", command: "npm" } })).ok, false);
    assert.match((await action.handler({ name, args: {} })).message, /工具调用标识/);
    assert.match((await tool({ ...wired, currentTurnId: () => undefined })!.handler(request)).message, /回合/);
    assert.equal(authorization, 0);
    assert.match((await action.handler(request)).message, /A11/);
    assert.equal(authorization, 1);
    port.authorize = async () => ({ isCurrent: () => true });
    const denied = tool(wired, () => { throw new Error("fixture write gate refusal"); })!;
    assert.match((await denied.handler(request)).message, /fixture write gate refusal/);
    assert.equal(generation, 0);
    await assert.rejects(access(join(root, "package-lock.json")), { code: "ENOENT" });
  });
});

test("validated lock bytes use the real host-facts write stages and durable claim", async () => {
  await fixture(async (root, options) => {
    const stages: string[] = [];
    const target = join(root, "package-lock.json");
    const expected = candidate();
    const sha = sha256(expected);
    const action = tool({
      ...options,
      governedPackageLock: {
        ...options.governedPackageLock!,
        async generate(bytes) {
          assert.deepEqual(JSON.parse(bytes.toString("utf8")), manifest);
          stages.push("generate");
          return { ok: true, value: expected };
        },
      },
      async claimFileWrite(claim) {
        stages.push("claim");
        assert.equal(claim.targetPath, target);
        assert.equal(claim.operation, "write");
        assert.equal(claim.contentSha256, sha);
        await assert.rejects(access(target), { code: "ENOENT" });
        return { ok: true, value: { async finish(outcome, evidence) {
          stages.push(outcome);
          assert.match(evidence, /package-lock\.json/);
          assert.deepEqual(await readFile(target), expected);
        } } };
      },
    }, inspectingGate(facts => {
      assert.equal(facts.targetPath, target);
      stages.push(facts.stage);
      if (facts.stage === "final-write") assert.equal(facts.contentSha256, sha);
    }))!;
    const result = await action.handler(request);
    assert.equal(result.ok, true, result.message);
    assert.ok(result.message.includes(sha));
    assert.deepEqual(stages, ["lexical-read", "canonical-read", "generate", "claim", "final-write", "succeeded"]);
    assert.deepEqual(await readFile(join(root, "package.json")), json(source));
    assert.deepEqual((await readdir(root)).sort(), ["package-lock.json", "package.json"]);
  });
});

test("rejects a non-registry, incomplete or malformed candidate without claiming a write", async () => {
  await fixture(async (root, options) => {
    let generation = 0;
    let claims = 0;
    const manifestPath = join(root, "package.json");
    const candidates = [candidate({ ...artifact, resolved: "https://another.example/three.tgz" }), candidate({ ...artifact, dependencies: { missing: "^1.0.0" } }), json({ error: "not a lock" })];
    const action = tool({
      ...options,
      governedPackageLock: {
        ...options.governedPackageLock!,
        generate: async () => ({ ok: true, value: candidates[generation++]! }),
      },
      claimFileWrite: async () => { claims++; throw new Error("candidate must be validated first"); },
    })!;
    for (const dependency of ["file:./dep", "https://evil.example/dep.tgz", "git+https://evil.example/dep", "owner/dep", "npm:another@1.0.0"]) {
      await writeFile(manifestPath, json({ ...manifest, dependencies: { three: dependency } }));
      assert.equal((await action.handler(request)).ok, false);
    }
    assert.equal(generation, 0);
    await writeFile(manifestPath, json({ ...manifest, overrides: { three: "1.0.0" } }));
    assert.equal((await action.handler(request)).ok, false);
    assert.equal(generation, 0);
    await writeFile(manifestPath, json(source));
    await link(manifestPath, join(root, "another-package.json"));
    assert.match((await action.handler(request)).message, /package.json/);
    assert.equal(generation, 0);
    await rm(join(root, "another-package.json"));
    for (const result of [/non-registry artifact/, /graph is incomplete/, /expected npm lockfile/]) {
      assert.match((await action.handler(request)).message, result);
    }
    assert.equal(claims, 0);
    await assert.rejects(access(join(root, "package-lock.json")), { code: "ENOENT" });
  });
});

test("rejects expiry during generation and settles no write on manifest drift after claim", async () => {
  await fixture(async (root, options) => {
    let current = true;
    const action = tool({
      ...options,
      governedPackageLock: {
        authorize: async () => ({ isCurrent: () => current }),
        generate: async () => { current = false; return { ok: true, value: candidate() }; },
      },
      claimFileWrite: async () => { throw new Error("expired work must not claim"); },
    })!;
    assert.match((await action.handler(request)).message, /任务已变化/);
    let settled: string | undefined;
    const staleManifest = tool({
      ...options,
      claimFileWrite: async () => {
        await writeFile(join(root, "package.json"), json({ ...source, version: "1.0.1" }));
        return { ok: true, value: { async finish(outcome) { settled = outcome; } } };
      },
    })!;
    assert.match((await staleManifest.handler(request)).message, /来源清单或任务已变化/);
    assert.equal(settled, "not-started");
    await assert.rejects(access(join(root, "package-lock.json")), { code: "ENOENT" });
  });
});

test("leaves a target that changes while generating intact before the durable claim", async () => {
  await fixture(async (root, options) => {
    const target = join(root, "package-lock.json");
    const external = json({ written: "outside this generation" });
    const action = tool({
      ...options,
      governedPackageLock: {
        ...options.governedPackageLock!,
        generate: async () => { await writeFile(target, external); return { ok: true, value: candidate() }; },
      },
      claimFileWrite: async () => assert.fail("a changed target cannot claim a write"),
    })!;
    assert.match((await action.handler(request)).message, /current file changed/);
    assert.deepEqual(await readFile(target), external);
  });
});

test("replayed trusted call keeps the durable operation key while new calls remain distinct", async () => {
  await fixture(async (root, options) => {
    const successful = new Set<string>();
    const attemptKeys: string[] = [];
    let writes = 0;
    let turn = "initial-host-turn";
    const configured = {
      ...options, currentTurnId: () => turn,
      versionedDocAfterWrite: async () => { writes++; },
      claimFileWrite: (async input => {
        attemptKeys.push(input.operationId);
        if (successful.has(input.operationId)) return { ok: false, code: "workflow-file-write-recorded", message: "already recorded" };
        return { ok: true, value: { async finish(outcome) {
          assert.equal(outcome, "succeeded");
          successful.add(input.operationId);
        } } };
      }) satisfies NonNullable<GovernedToolsOptions["claimFileWrite"]>,
    };
    assert.equal((await tool(configured)!.handler(request)).ok, true);
    // Rebuild tool closures to exercise the persisted claim contract, not an in-memory tool cache.
    const replay = await tool(configured)!.handler(request);
    assert.equal(replay.ok, false);
    assert.match(replay.message, /already recorded/);
    assert.equal(writes, 1);
    assert.equal(successful.size, 1);
    assert.equal(attemptKeys[0], attemptKeys[1]);
    assert.deepEqual(await readFile(join(root, "package-lock.json")), candidate());

    assert.equal((await tool(configured)!.handler({ ...request, toolCallId: "new-host-call" })).ok, true);
    assert.notEqual(attemptKeys[1], attemptKeys[2]);
    turn = "next-host-turn";
    assert.equal((await tool(configured)!.handler(request)).ok, true);
    assert.notEqual(attemptKeys[0], attemptKeys[3]);
    assert.equal(writes, 3);
    assert.equal(successful.size, 3);
  });
});

test("a pinned host turn that changes during generation is refused before the durable claim", async () => {
  await fixture(async (root, options) => {
    let turn = "initial-host-turn";
    const action = tool({
      ...options, currentTurnId: () => turn,
      governedPackageLock: {
        ...options.governedPackageLock!,
        generate: async () => { turn = "different-host-turn"; return { ok: true, value: candidate() }; },
      },
      claimFileWrite: async () => assert.fail("the prior host turn cannot claim a write"),
    })!;
    assert.match((await action.handler(request)).message, /任务已变化/);
    await assert.rejects(access(join(root, "package-lock.json")), { code: "ENOENT" });
  });
});
