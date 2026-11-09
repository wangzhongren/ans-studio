// test/测试/git-action-cross-runtime-pi-init.test.ts
// W5 跨角色集成 —— Pi actor 的结构化 Git 动作（AC-2：不同运行时同一门）。
// 受保护项目 + Pi actor（真实 Core 包装层 + 桩件 provider）+ 真实 host inventory/trunk/init 源 ⇒
// `git_candidate init` 动作时授权通过；sidecar `policyInputDigests:{init,candidate}` 与 template/actor 正确；
// native 事实缺失不成为授权输入（AC-7）。夹具见 `git-action-cross-runtime-fixture.ts`。
import assert from "node:assert/strict";
import { test, after } from "node:test";

import { readGitActionAuthorizations, readGitInitializationRecord } from "../../src/provider/trunk/public/trunk-store.ts";
import { disposeOpenedSessions, entryOf, runInitScenario } from "./git-action-cross-runtime-fixture.ts";

after(disposeOpenedSessions);

test("AC-2 Pi actor：受保护 + 角色 ACL 内 git_candidate init 动作时授权通过；sidecar/template/optionalEvidence 正确", async () => {
  const scenario = await runInitScenario({ runtime: "pi", operationId: "w5-cross-pi-init", prefix: "ans-w5-pi-" });
  const { root, actor, result } = scenario;
  assert.equal(result.status, "prepared", JSON.stringify(result));
  const sidecar = await readGitActionAuthorizations(root, "w5-cross-pi-init");
  assert.equal(sidecar.ok, true);
  if (!sidecar.ok) return;
  assert.equal(sidecar.records.length, 1);
  const record = sidecar.records[0]!;
  assert.equal(record.template, "init");
  assert.equal(record.actorRoleId, "convener");
  assert.equal(record.coreSessionId, actor.sessionId);
  assert.deepEqual(Object.keys(record.policyInputDigests), ["init", "candidate"]);
  // Pi 桩件（custom provider）不产生 native 事实：证据缺失不改变判定（AC-7 / N6）。
  assert.equal(entryOf(actor.sessionId)?.lifecycle?.native, undefined, "Pi 桩件会话无 native 事实");
  assert.equal(Object.hasOwn(record.optionalEvidence, "nativeStatus"), false, "native 缺失不成为授权输入");
  assert.equal((await readGitInitializationRecord(root, "w5-cross-pi-init"))?.stage, "candidate-created");
});
