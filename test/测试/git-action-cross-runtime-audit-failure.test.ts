// test/测试/git-action-cross-runtime-audit-failure.test.ts
// W5 跨角色集成 —— AC-16 集成级失败注入：受保护项目 + Claude actor；把
// `.ans/trunk/operations/<sha256(operationId)>/authorization.jsonl` 位置以目录占位（真实 lease 下的
// 写入 store 阻断）⇒ `git-action-audit-unavailable`，动作不执行：无 `.git`、无 init.json、无 ref/对象副作用。
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { test, after } from "node:test";

import { readGitInitializationRecord } from "../../src/provider/trunk/public/trunk-store.ts";
import { disposeOpenedSessions, runInitScenario, sidecarPath } from "./git-action-cross-runtime-fixture.ts";

after(disposeOpenedSessions);

test("AC-16 集成：sidecar 写入失败 ⇒ git-action-audit-unavailable，无 .git/init.json/ref 副作用（write-ahead 失败即不执行）", async () => {
  const scenario = await runInitScenario({ runtime: "claude", operationId: "w5-cross-ac16", prefix: "ans-w5-ac16-", blockSidecarStore: true });
  const { root, result } = scenario;
  assert.equal(result.status, "blocked", JSON.stringify(result));
  assert.equal(result.status === "blocked" ? result.code : undefined, "git-action-audit-unavailable", JSON.stringify(result));
  assert.equal(fs.existsSync(`${root}/.git`), false, "sidecar 失败 ⇒ 不创建仓库");
  assert.equal(await readGitInitializationRecord(root, "w5-cross-ac16"), null, "sidecar 失败 ⇒ 不写 init.json");
  assert.equal(await fsp.stat(sidecarPath(root, "w5-cross-ac16")).then(stat => stat.isDirectory(), () => false), true,
    "阻断位置未被覆盖（注入仍在；无审计文件产生）");
});
