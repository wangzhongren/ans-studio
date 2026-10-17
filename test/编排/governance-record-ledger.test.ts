// test/编排/governance-record-ledger.test.ts
// W2（2026-10-17）治理记录建立/重新接受 → 账本事件（评审 §5.7/§7.3）。
//
// 覆盖：
//   ① establish 成功后写 `governance.established`（actorRoleId="app"、power="app"、
//      decisionEvidence.action="establish"、可选 previewDigest）；
//   ② reaccept 成功后写 `governance.reaccepted`（action="reaccept" + previewDigest）；
//   ③ 被 guard/precheck 拒绝的动作**不写**账本事件（零新增）；
//   ④ 迁移 `governance.migrated` 见 `test/编排/governance-migration.test.ts`（V1b）。
//
// 全部临时目录；不读 `.env`、不跑真实模型/凭据/网络。

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  establishGovernanceRecord,
  previewGovernanceReacceptance,
  reacceptGovernancePins,
} from "../../src/common/编排/finalize.ts";
import {
  flushGovernanceLedger,
  readGovernanceLedger,
} from "../../src/common/编排/governance-ledger.ts";

function withTarget<T>(fn: (target: string) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-gov-record-ledger-"));
  const target = join(root, "proj");
  mkdirSync(target, { recursive: true });
  return fn(target).finally(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  });
}

function writeRole(target: string): void {
  const dir = join(target, "角色卡", "X");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "role-card.md"), "# X\n\n测试角色。\n", "utf8");
  writeFileSync(
    join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: 测试角色条目\n",
    "utf8",
  );
}

test("establish / reaccept 成功后写治理账本事件；拒绝路径零新增", async () => {
  await withTarget(async (target) => {
    writeRole(target);
    const previewDigest = "a".repeat(64);

    const established = await establishGovernanceRecord({
      projectRoot: target,
      skillRoot: target,
      governanceModel: "trio",
      previewDigest,
    });
    assert.equal(established.ok, true, JSON.stringify(established));
    // 评审 §5.5：establish 把模型交给 finalize ⇒ `.ans` 写出 governanceModel。
    const ans = JSON.parse(readFileSync(join(target, ".ans", "project.json"), "utf8")) as { governanceModel?: string };
    assert.equal(ans.governanceModel, "trio");
    await flushGovernanceLedger(target);

    let read = await readGovernanceLedger(target);
    assert.deepEqual(read.errors, []);
    const created = read.entries.filter((e) => e.kind === "governance.established");
    assert.equal(created.length, 1);
    assert.equal(created[0].actorRoleId, "app");
    assert.equal(created[0].power, "app");
    assert.equal(created[0].decisionEvidence?.kind, "desktop-governance-record");
    assert.equal(created[0].decisionEvidence?.action, "establish");
    assert.equal(created[0].decisionEvidence?.previewDigest, previewDigest);

    // 再次 establish（already-established）→ 不新增账本事件。
    const again = await establishGovernanceRecord({ projectRoot: target, skillRoot: target });
    assert.equal(again.ok, false);
    await flushGovernanceLedger(target);
    read = await readGovernanceLedger(target);
    assert.equal(read.entries.filter((e) => e.kind === "governance.established").length, 1);

    // 造成 pin 失配 → 预览 → 重新接受；成功后写 governance.reaccepted。
    writeFileSync(
      join(target, "角色卡", "X", "boundary.yaml"),
      "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: 测试角色条目（已改）\n",
      "utf8",
    );
    const preview = await previewGovernanceReacceptance({ projectRoot: target, skillRoot: target });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    if (!preview.ok) return;

    const reaccepted = await reacceptGovernancePins({
      projectRoot: target,
      skillRoot: target,
      governanceModel: "trio",
      confirm: true,
      previewDigest: preview.preview.previewDigest,
    });
    assert.equal(reaccepted.ok, true, JSON.stringify(reaccepted));
    await flushGovernanceLedger(target);

    read = await readGovernanceLedger(target);
    const reacceptedEntries = read.entries.filter((e) => e.kind === "governance.reaccepted");
    assert.equal(reacceptedEntries.length, 1);
    assert.equal(reacceptedEntries[0].actorRoleId, "app");
    assert.equal(reacceptedEntries[0].power, "app");
    assert.equal(reacceptedEntries[0].decisionEvidence?.action, "reaccept");
    assert.equal(reacceptedEntries[0].decisionEvidence?.previewDigest, preview.preview.previewDigest);
  });
});
