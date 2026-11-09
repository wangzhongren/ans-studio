// test/编排/git-action-authorization-wiring-audit-failure.test.ts
// W3b（B1 AC-16；P1.4 §3.4.3/§3.8；I0-1/I0-2）：sidecar authorization 写入失败（真实 lease 下、
// 真实路径被阻断）⇒ `git-action-audit-unavailable`，动作不执行：无仓库/对象/ref、无 init.json
// （journal prepared 记录）、无工作树效果。
//
// 独立文件/进程：custom provider Core 会话无法以 drained 收口（I0-3 冻结），项目根与 Core 条目按文件隔离。

import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { test, after } from "node:test";

import type { RoleSession } from "../../src/model/runtime.ts";
import { createInitFixture, w3bSha256, w3bSidecarPath } from "./fixtures/git-action-authorization-wiring.ts";

const opened: RoleSession[] = [];
after(async () => {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
});

test("wiring failure injection: blocked sidecar store ⇒ git-action-audit-unavailable with no repository, journal or ref effects", async () => {
  const fixture = await createInitFixture({ operationId: "w3b-init-audit-blocked", blockSidecarStore: true, opened });
  try {
    const act = await fixture.runtime.gitCandidate(fixture.request);
    assert.equal(act.status, "blocked", JSON.stringify(act));
    assert.equal(act.code, "git-action-audit-unavailable", `append 失败必须 fail-closed：${JSON.stringify(act)}`);
    assert.equal(act.operationId, fixture.request.operationId);
    assert.equal(await fs.stat(path.join(fixture.root, ".git")).then(() => true, () => false), false, "无仓库/对象/ref 效果");
    const journalPath = path.join(fixture.root, ".ans/trunk/operations", w3bSha256(fixture.request.operationId), "init.json");
    assert.equal(await fs.stat(journalPath).then(() => true, () => false), false, "无 init.json prepared 记录（效果从未开始）");
    assert.equal((await fs.stat(w3bSidecarPath(fixture.root, fixture.request.operationId))).isDirectory(), true, "阻断位置未被改写/覆盖");
  } finally {
    fixture.held.release();
    await fixture.pumping;
  }
});
