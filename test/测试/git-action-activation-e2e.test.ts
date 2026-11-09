// test/测试/git-action-activation-e2e.test.ts
// W7（B2 v1 补证，P1.2-AC-31 activation 发布）：真实 plan/activation 链上的
// `executeGitActiveRolePublication`（`executeGitBusinessPublication` kind="active"）完整效果链：
// 真实 nominator Core 回合（active activate_role_documents）→ 动作时授权 → `checkGitPolicy` 两 verdict
// （candidate+publication）→ 两阶段复检 → host lease → write-ahead sidecar `{candidate,publication}` →
// 真实 active 指针提交（ref/journal/发布回执）。文档/计划/initial workflow 三类已由 W3b 夹具覆盖
// （`test/编排/git-action-authorization-wiring-document|publication|initial-workflow.test.ts`）。
//
// 依据：B1 v1 P1.2-AC-31（§3）；设计 P1.4 §3.3.1/§3.4.3/§4.5/§6.1；I0-1/I0-2/I0-4；B2 v1 §4 关闭条件 5。
import assert from "node:assert/strict";
import { test, after } from "node:test";
import * as fsp from "node:fs/promises";
import path from "node:path";

import { createGitRefStore, createProjectTrunkStore, readGitActionAuthorizations } from "../../src/provider/trunk/public/trunk-store.ts";
import { buildWriteChain, disposeChainSessions, exportEvidence } from "./git-write-chain-fixture.ts";
import { disposeOpenedSessions, sha256, sidecarPath } from "./git-action-cross-runtime-fixture.ts";

after(async () => { await disposeOpenedSessions(); await disposeChainSessions(); });

const RETIRED_CODES = ["git-core-creation-proof-unavailable", "git-native-surface-unproven", "git-unclosed-effect-registered",
  "official-pure-preparation-unproven", "native-factory-plan-unavailable"];

test("P1.2-AC-31：activation 发布 E2E（真实 plan→D3→nominator 回合；sidecar {candidate,publication} 两键 + ref/journal + 发布回执；无 native）", async () => {
  const chain = await buildWriteChain({ prefix: "ans-w7-activation-", activationMode: "runtime" });
  const operationId = "w7-activation";
  const receipt = chain.activationReceipt as { status?: string; source?: { kind?: string; action?: string; actorRoleId?: string }; activationDigest?: string };
  assert.equal(receipt.status, "applied", JSON.stringify(receipt));
  assert.ok(receipt.source?.kind === "role-direct" && receipt.source.action === "activate-role-documents" && receipt.source.actorRoleId === "nominator",
    "发布回执来源必须是真实 nominator role-direct activate-role-documents");
  assert.match(receipt.activationDigest ?? "", /^[a-f0-9]{64}$/);

  // sidecar：真实 write-ahead 授权行，R2 两键（candidate+publication）。
  const sidecarFile = sidecarPath(chain.root, operationId);
  const sidecarRead = await readGitActionAuthorizations(chain.root, operationId);
  assert.equal(sidecarRead.ok, true, JSON.stringify(sidecarRead));
  if (!sidecarRead.ok) return;
  assert.equal(sidecarRead.records.length, 1);
  const record = sidecarRead.records[0]!;
  assert.equal(record.template, "publish-documents", "activation 模板取 publicationPolicyInput.template");
  assert.equal(record.actorRoleId, "nominator");
  assert.equal(record.coreSessionId, chain.activationSessionId, "actor 为真实 nominator Core 会话");
  assert.equal(record.taskId, chain.nominationTaskId);
  assert.equal(record.activeTool, "activate_role_documents");
  assert.deepEqual(Object.keys(record.policyInputDigests), ["candidate", "publication"], "R2：两键");
  assert.match(record.policyInputDigests.candidate!, /^[a-f0-9]{64}$/);
  assert.match(record.policyInputDigests.publication!, /^[a-f0-9]{64}$/);
  assert.notEqual(record.policyInputDigests.candidate, record.policyInputDigests.publication);
  assert.ok(record.leaseId.length > 0);
  assert.equal("applicationMediation" in (record.optionalEvidence ?? {}), false);

  // 真实 active 指针：manifest activeRevision=1 + impl 证据；ref/journal 已提交。
  const manifest = await createProjectTrunkStore(chain.root).readManifest();
  assert.ok(manifest.ok, JSON.stringify(manifest));
  if (!manifest.ok) return;
  assert.equal(manifest.value.activeRevision, 1);
  assert.ok(manifest.value.activeRoles?.impl, "真实 active role 证据必须发布");
  const journal = await createGitRefStore(chain.root).readJournal(operationId);
  assert.ok(journal, "真实 activation git journal 必须存在");
  if (!journal) return;
  assert.equal(journal.phase, "published");
  assert.equal(journal.ref, "refs/ans/trunk");
  assert.equal(journal.businessJournal?.actionSource?.kind, "role-direct");
  assert.equal(journal.businessJournal?.actionSource?.action, "activate-role-documents");
  const sidecarStat = await fsp.stat(sidecarFile);
  const journalStat = await fsp.stat(path.join(chain.root, ".ans/trunk/operations", sha256(operationId), "git.json"));
  assert.ok(sidecarStat.mtimeMs <= journalStat.mtimeMs, "authorization.jsonl 必须先于 git.json 效果写入（write-ahead）");
  // 无 native / 旧注册表级码零命中（真实回执 JSON）。
  const receiptText = JSON.stringify(receipt);
  for (const code of RETIRED_CODES) assert.equal(receiptText.includes(code), false, `旧/退役码不得出现：${code}`);

  await exportEvidence("ac31-activation.json", { operationId, receipt, sidecar: { path: sidecarFile, records: sidecarRead.records }, journal,
    manifest: { trunkVersion: manifest.value.trunkVersion, activeRevision: manifest.value.activeRevision, activeDigest: manifest.value.activeDigest,
      activeRoleImpl: manifest.value.activeRoles?.impl },
    plan: { operationId: "w7-plan-publication", trunkVersionAfterFirst: 2, planPath: chain.planPath } });
});
