// test/runtime-core/evidence-check-tool.test.ts
// 2026-10-30（3.4/P4.4）：evidence_check 只读工具注册、参数、≤4KB、未注入不注册。
import test from "node:test";
import assert from "node:assert/strict";

import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import type { WriteGate } from "../../src/model/runtime.ts";

const gate = (() => ({ allowed: true })) as unknown as WriteGate;
const criteriaRef = { path: "docs/acceptance/focus-criteria-v1.md", sha256: "a".repeat(64), version: 1 };

test("evidence_check：注入才注册；参数透传；≤4KB 截断", async () => {
  let seen: unknown;
  const tools = buildGovernedTools(gate, {
    roleId: "verifier",
    evidenceCheck: async (input) => { seen = input; return "x".repeat(10_000); },
  });
  const tool = tools.find((item) => item.name === "evidence_check");
  assert.ok(tool);
  if (!tool) return;
  const result = await tool.handler({ args: { artifact: "tests/evidence/a.txt", acId: "AC-28", criteriaRef } } as never);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(Buffer.byteLength(result.message, "utf8") <= 4096);
    assert.match(result.message, /已截断/);
  }
  assert.deepEqual(seen, { artifact: "tests/evidence/a.txt", acId: "AC-28", criteriaRef });
  const missingRef = await tool.handler({ args: { artifact: "tests/evidence/a.txt" } } as never);
  assert.equal(missingRef.ok, false);
  assert.equal(buildGovernedTools(gate, { roleId: "verifier" }).some((item) => item.name === "evidence_check"), false);
});
