// test/测试/git-action-cross-runtime-codex-init.test.ts
// W5 跨角色集成 —— Codex actor 的 native 不可用路径（P1.2-AC-27 动作侧）：桩件 provider 不产生 native 事实，
// `git_candidate init` 仍按动作时授权通过；optionalEvidence 无 nativeStatus；init.json/.git 效果存在。
// （创建期 native observed/不可用对照见本目录 `git-action-cross-runtime-init.test.ts` 与 W1
// `test/runtime-core/codex-native-optional.test.ts`；真实 Codex 运行不在本文件范围。）
import assert from "node:assert/strict";
import { test, after } from "node:test";

import { readGitActionAuthorizations, readGitInitializationRecord } from "../../src/provider/trunk/public/trunk-store.ts";
import { disposeOpenedSessions, entryOf, runInitScenario } from "./git-action-cross-runtime-fixture.ts";

after(disposeOpenedSessions);

test("P1.2-AC-27 Codex actor：native 事实不可用仍可 init（动作时授权）；sidecar 无 nativeStatus、init.json 真实存在", async () => {
  const scenario = await runInitScenario({ runtime: "codex", operationId: "w5-cross-codex-init", prefix: "ans-w5-codex-" });
  const { root, actor, result } = scenario;
  assert.equal(result.status, "prepared", JSON.stringify(result));
  const sidecar = await readGitActionAuthorizations(root, "w5-cross-codex-init");
  assert.equal(sidecar.ok, true);
  if (!sidecar.ok) return;
  assert.equal(sidecar.records.length, 1);
  const record = sidecar.records[0]!;
  assert.equal(record.template, "init");
  assert.equal(record.coreSessionId, actor.sessionId);
  assert.deepEqual(Object.keys(record.policyInputDigests), ["init", "candidate"]);
  assert.equal(entryOf(actor.sessionId)?.lifecycle?.native, undefined, "桩件 Codex 无 native 生命周期事实");
  assert.equal(Object.hasOwn(record.optionalEvidence, "nativeStatus"), false,
    "native 不可用 ⇒ optionalEvidence 无 nativeStatus，但动作照常通过（可选证据不是授权）");
  assert.equal((await readGitInitializationRecord(root, "w5-cross-codex-init"))?.stage, "candidate-created");
});
