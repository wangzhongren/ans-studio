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

test("evidence_check：工具层拒绝越界路径与跨角色查询（伪数据源也不放行）", async () => {
  let calls = 0;
  const tools = buildGovernedTools(gate, {
    roleId: "verifier",
    evidenceCheck: async () => { calls += 1; return "{\"ok\":true}"; },
  });
  const tool = tools.find((item) => item.name === "evidence_check");
  assert.ok(tool);
  if (!tool) return;
  for (const metaPath of ["../outside.meta.json", "C:/outside.meta.json", ".ans/state.json", ".env"]) {
    const denied = await tool.handler({ args: { artifact: "tests/evidence/a.txt", metaPath, acId: "AC-28", criteriaRef } } as never);
    assert.equal(denied.ok, false, metaPath);
    if (!denied.ok) assert.match(denied.message, /evidence-path-invalid/);
  }
  const foreign = await tool.handler({ args: { artifact: "tests/evidence/a.txt", roleId: "other-role", acId: "AC-28", criteriaRef } } as never);
  assert.equal(foreign.ok, false);
  if (!foreign.ok) assert.match(foreign.message, /evidence-scope-denied/);
  assert.equal(calls, 0, "被拒的越界/跨角色调用不应触达数据源");
  const own = await tool.handler({ args: { artifact: "tests/evidence/a.txt", roleId: "verifier", acId: "AC-28", criteriaRef } } as never);
  assert.equal(own.ok, true);
  assert.equal(calls, 1);
});
