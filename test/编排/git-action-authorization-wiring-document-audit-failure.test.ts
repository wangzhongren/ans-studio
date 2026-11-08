// test/编排/git-action-authorization-wiring-document-audit-failure.test.ts
// W3b（B1 AC-16；P1.4 §3.4.3/§3.8；I0-2；I0-11）：文档发布在 sidecar 写入失败时 ⇒
// `git-action-audit-unavailable`，不执行 store 写入：无 trunk ref、无 journal、无工作树效果。
//
// 独立文件/进程：custom provider Core 会话无法以 drained 收口（I0-3 冻结）。

import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { test, after } from "node:test";

import { executeGitDocumentPublication } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { readGitActionAuthorizations, createGitCandidateStore } from "../../src/provider/trunk/public/trunk-store.ts";
import type { RoleSession } from "../../src/model/runtime.ts";
import { createDocumentFixture, w3bSha256, w3bSidecarPath } from "./fixtures/git-action-authorization-wiring.ts";

const opened: RoleSession[] = [];
after(async () => {
  for (const session of opened) { try { await session.dispose(); } catch { /* process-exit cleanup */ } }
});

test("wiring document publication failure injection: blocked sidecar store ⇒ git-action-audit-unavailable with no ref/journal effects", async () => {
  const fixture = await createDocumentFixture({ operationId: "w3b-doc-audit-blocked", blockSidecarStore: true, opened });
  try {
    const refsBefore = await createGitCandidateStore(fixture.root).readRef("refs/ans/trunk");
    assert.equal(refsBefore, null, "首发布前没有 trunk ref");
    const receipt = await executeGitDocumentPublication({ projectRoot: fixture.root, applyInput: fixture.applyInput });
    assert.equal(receipt.ok, false, JSON.stringify(receipt));
    assert.equal(receipt.errorCode, "git-action-audit-unavailable", `append 失败必须 fail-closed：${JSON.stringify(receipt)}`);
    assert.equal(await createGitCandidateStore(fixture.root).readRef("refs/ans/trunk"), null, "无 trunk ref 效果");
    const journalPath = path.join(fixture.root, ".ans/trunk/operations", w3bSha256(fixture.applyInput.operationId), "git.json");
    assert.equal(await fs.stat(journalPath).then(() => true, () => false), false, "无发布 journal");
    assert.equal(await fs.readFile(w3bSidecarPath(fixture.root, fixture.applyInput.operationId), "utf8"), "not-json\n", "损坏的既有 sidecar 未被改写/覆盖");
    const sidecar = await readGitActionAuthorizations(fixture.root, fixture.applyInput.operationId);
    assert.equal(sidecar.ok, false, "sidecar 内容校验仍 fail-closed");
  } finally {
    fixture.held.release();
    await fixture.pumping;
  }
});
