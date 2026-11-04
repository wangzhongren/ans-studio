// test/门禁引擎/convener-workflow-write.test.ts
// 2026-11-04 客户决定（方案 A）：恢复运营（convener）对 docs/workflow.md 的精确文件写权，
// 保留「工作流先行」；不得放宽 chief/product/verifier 的禁写清单与其他角色写集。
// 依据：docs/communication/2026-11-04_issue-workflow-md-no-writer.md（客户否决「缺省容忍」方案 B）。
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUILT_IN_GOVERNANCE_ROLES,
  governanceRoleOf,
} from "../../src/common/门禁引擎/governance-roles.ts";

const WORKFLOW = "docs/workflow.md";

test("注册表：convener Section 1 含 docs/workflow.md 精确文件条目，且列入 preauthorizedDirs", () => {
  const convener = governanceRoleOf("convener");
  assert.ok(convener, "convener 必须存在");
  const entry = convener!.entries.find((e) => e.path === WORKFLOW);
  assert.ok(entry, "convener.entries 必须含 docs/workflow.md");
  assert.equal(entry!.root, "project", "root 恒为 project");
  assert.equal(entry!.kind, "file", "必须是精确文件条目（非目录）");
  assert.match(entry!.purpose, /步骤表/, "purpose 须写清步骤表内容");
  assert.match(entry!.purpose, /由运营落盘并维护/, "purpose 须声明由运营落盘并维护");
  assert.ok(
    convener!.preauthorizedDirs.includes(WORKFLOW),
    "工作流必须列入 preauthorizedDirs（有任务 writeSet 时也生效）",
  );
});

test("注册表：其他角色写集不被放宽——chief/product/verifier 仍禁写，rapporteur/nominator 不含该条目", () => {
  for (const id of ["chief", "product", "verifier"]) {
    const spec = governanceRoleOf(id)!;
    assert.ok(spec.forbiddenWritePaths.includes(WORKFLOW), `${id} 必须继续禁写 docs/workflow.md`);
    assert.equal(spec.entries.some((e) => e.path === WORKFLOW), false, `${id} 的 Section 1 不得含 docs/workflow.md`);
  }
  for (const id of ["rapporteur", "nominator"]) {
    const spec = governanceRoleOf(id)!;
    assert.equal(spec.entries.some((e) => e.path === WORKFLOW), false, `${id} 不得获得 docs/workflow.md 写权`);
  }
});

test("卡文本：运营负责落盘工作流，幕僚不再被暗示为写者", () => {
  const convenerCard = governanceRoleOf("convener")!.cardText;
  assert.match(convenerCard, /项目工作流：由你落盘并维护 `docs\/workflow\.md`/);
  assert.match(convenerCard, /可写：`docs\/workflow\.md`（项目工作流）/);
  const chiefCard = governanceRoleOf("chief")!.cardText;
  assert.match(chiefCard, /项目工作流文件 `docs\/workflow\.md` 由运营落盘维护/);
});

test("注册表完整性：仍恰为六角色，convener 能力位不变（写权恢复不扩张能力）", () => {
  assert.deepEqual(
    BUILT_IN_GOVERNANCE_ROLES.map((r) => r.id),
    ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
  );
  const caps = governanceRoleOf("convener")!.capabilities;
  assert.equal(caps.dispatchTask, true);
  assert.equal(caps.roleStatus, false);
  assert.equal(caps.sessionTail, false);
  assert.equal(caps.installSkill, false);
  assert.equal(caps.installMcp, false);
});
