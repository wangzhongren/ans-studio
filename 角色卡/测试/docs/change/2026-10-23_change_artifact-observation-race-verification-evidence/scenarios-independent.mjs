import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = 'C:/Users/51054/Desktop/work/ans-studio';
const mod = (rel) => import(pathToFileURL(join(repo, rel)).href);
const { createFlowService } = await mod('src/common/编排/flow-service.ts');
const { observeFlowArtifacts } = await mod('src/pipeline/orchestration/flow-state.ts');
const { readGovernanceLedger } = await mod('src/common/编排/governance-ledger.ts');
const { parseFlowStateYaml } = await mod('src/common/编排/flow-state.ts');

const FLOW_REL = 'docs/flows/flow-a.yaml';
const REF = 'docs/scheduling/flow-a-change-v5.md';
const results = [];
function rec(id, ok, detail) {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`);
}
function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'ans-artifact-verify-'));
  return fn(root).finally(() => { try { rmSync(root, { recursive: true, force: true }); } catch {} });
}
function writeFile(root, rel, content) {
  const abs = join(root, ...rel.split('/'));
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
}
function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }
function flowYaml(over = {}) {
  const ref = over.ref ?? REF;
  const owner = over.owner ?? 'convener';
  return [
    'flowId: flow-a', 'version: 1', 'qualityTier: production', 'steps:',
    '  - id: change-package', '    title: 变更包', `    owner: ${owner}`, '    kind: artifact',
    '    status: delivered', `    evidence: { kind: artifact, ref: ${JSON.stringify(ref)} }`,
    '  - id: verification', '    title: 验收', '    owner: verifier', '    kind: acceptance',
    '    status: pending', '',
  ].join('\n');
}
function ledgerEntry(partial) {
  return { at: '2026-10-20T00:00:00.000Z', actorRoleId: 'app', power: 'app', ...partial };
}
function writeLedger(root, entries) {
  writeFile(root, '.ans/governance/ledger.jsonl', entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''));
}
function service(root, over = {}) {
  return createFlowService({ projectRoot: root, actorRoleId: 'convener', actorPower: 'schedule', ...over });
}
async function rev(svc) { return (await svc.get({ flowId: 'flow-a' })).revision; }
function done(svc, ref, revision) {
  return svc.update({ flowId: 'flow-a', stepId: 'change-package', status: 'done', evidence: { kind: 'artifact', ref }, expectedRevision: revision });
}
async function observations(root) {
  const ledger = await readGovernanceLedger(root);
  return ledger.entries.filter((e) => e.kind === 'artifact.observed');
}
function flowBytes(root) { return readFileSync(join(root, ...FLOW_REL.split('/'))); }
function stepStatus(root, id) {
  const parsed = parseFlowStateYaml(readFileSync(join(root, ...FLOW_REL.split('/')), 'utf8'), 'flow-a');
  if (!parsed.ok) throw new Error('flow parse failed');
  return parsed.flow.steps.find((s) => s.id === id)?.status;
}

// S1: file exists, ledger has no observation -> done + exactly one observation
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  const content = '# change package v5\n';
  writeFile(root, REF, content);
  const svc = service(root);
  const r = await done(svc, REF, await rev(svc));
  const obs = await observations(root);
  const e = obs[0];
  const ledger = await readGovernanceLedger(root);
  const ok = r.ok === true && stepStatus(root, 'change-package') === 'done' && obs.length === 1 &&
    e.actorRoleId === 'convener' && e.power === 'schedule' && e.artifactPath === REF &&
    e.artifactSha256 === sha256(Buffer.from(content)) && e.flowId === 'flow-a' && e.stepId === undefined &&
    ledger.entries.filter((x) => x.kind === 'customer.decision').length === 0;
  rec('S1', ok, JSON.stringify({ ok: r.ok, code: r.code, step: stepStatus(root, 'change-package'), obs: obs.length, entry: e }));
});

// S2: existing same-path observation (different sha, file missing) -> no duplicate, update ok
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  writeLedger(root, [ledgerEntry({ kind: 'artifact.observed', actorRoleId: 'convener', power: 'schedule', artifactPath: REF, artifactSha256: '0'.repeat(64), flowId: 'flow-a' })]);
  const svc = service(root);
  const r = await done(svc, REF, await rev(svc));
  const obs = await observations(root);
  rec('S2', r.ok === true && obs.length === 1 && obs[0].artifactSha256 === '0'.repeat(64), JSON.stringify({ ok: r.ok, code: r.code, obs: obs.length, sha: obs[0]?.artifactSha256 }));
});

// S3: missing file -> insufficient-evidence, zero new observation, flow bytes unchanged
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  const before = flowBytes(root);
  const svc = service(root);
  const r = await done(svc, REF, await rev(svc));
  rec('S3', r.ok === false && r.code === 'insufficient-evidence' && /missing/.test(r.error ?? '') && (await observations(root)).length === 0 && flowBytes(root).equals(before), JSON.stringify({ ok: r.ok, code: r.code, error: r.error, issues: r.issues }));
});

// S4: outside project -> invalid-flow at parse, zero observation
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  const svc = service(root);
  const r = await done(svc, '../outside.md', await rev(svc));
  rec('S4', r.ok === false && r.code === 'invalid-flow' && (await observations(root)).length === 0, JSON.stringify({ ok: r.ok, code: r.code, error: r.error }));
});

// S5: excluded segments -> insufficient-evidence, zero observation
for (const ref of ['.ans/secret.md', '角色卡/x.md', '.git/config', 'node_modules/dep/index.js']) {
  await withRoot(async (root) => {
    writeFile(root, FLOW_REL, flowYaml({ ref }));
    writeFile(root, ref, 'x');
    const svc = service(root);
    const r = await done(svc, ref, await rev(svc));
    rec(`S5[${ref}]`, r.ok === false && r.code === 'insufficient-evidence' && (await observations(root)).length === 0, JSON.stringify({ ok: r.ok, code: r.code, error: r.error }));
  });
}

// S6: >2 MiB -> insufficient-evidence, zero observation
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  writeFile(root, REF, 'x'.repeat(2 * 1024 * 1024 + 1));
  const svc = service(root);
  const r = await done(svc, REF, await rev(svc));
  rec('S6', r.ok === false && r.code === 'insufficient-evidence' && /too-large/.test(r.error ?? '') && (await observations(root)).length === 0, JSON.stringify({ ok: r.ok, code: r.code, error: r.error }));
});

// S7: binary (NUL) -> insufficient-evidence, zero observation
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  writeFile(root, REF, Buffer.from([0x23, 0x00, 0x01]));
  const svc = service(root);
  const r = await done(svc, REF, await rev(svc));
  rec('S7', r.ok === false && r.code === 'insufficient-evidence' && /binary/.test(r.error ?? '') && (await observations(root)).length === 0, JSON.stringify({ ok: r.ok, code: r.code, error: r.error }));
});

// S8: ledger append failure (chmod 444) -> ledger-write-failed, flow unchanged; restore -> success, exactly one
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  writeFile(root, REF, '# v5\n');
  writeLedger(root, []);
  const before = flowBytes(root);
  const svc = service(root);
  const revision = await rev(svc);
  const ledgerAbs = join(root, '.ans', 'governance', 'ledger.jsonl');
  chmodSync(ledgerAbs, 0o444);
  let failed;
  try { failed = await done(svc, REF, revision); } finally { chmodSync(ledgerAbs, 0o644); }
  const mid = { ok: failed.ok, code: failed.code, error: failed.error, obs: (await observations(root)).length, flowUnchanged: flowBytes(root).equals(before) };
  if (failed.ok) {
    rec('S8', false, `NOT_REPRODUCED_ON_HOST ${JSON.stringify(mid)}`);
    return;
  }
  const retry = await done(svc, REF, revision);
  const obs = await observations(root);
  rec('S8', failed.code === 'ledger-write-failed' && mid.flowUnchanged && mid.obs === 0 && retry.ok === true && obs.length === 1 && stepStatus(root, 'change-package') === 'done', JSON.stringify({ first: mid, retry: { ok: retry.ok, code: retry.code }, obs: obs.length }));
});

// S9: dispatch / customer-decision / acceptance done -> no observation
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, [
    'flowId: flow-a', 'version: 1', 'qualityTier: production', 'steps:',
    '  - id: impl', '    title: 实现', '    owner: backend', '    kind: dispatch', '    status: delivered', '    evidence: { kind: dispatch, ref: impl }',
    '  - id: appointment-gate', '    title: 任命', '    owner: convener', '    kind: customer-decision', '    status: delivered', '    evidence: { kind: customer-decision, ref: appointment }',
    '  - id: verification', '    title: 验收', '    owner: verifier', '    kind: acceptance', '    status: delivered', '    evidence: { kind: acceptance, ref: acceptance }', '',
  ].join('\n'));
  writeLedger(root, [
    ledgerEntry({ kind: 'dispatch.accepted', flowId: 'flow-a', stepId: 'impl' }),
    ledgerEntry({ kind: 'customer.decision', flowId: 'flow-a', actorRoleId: 'convener', power: 'schedule', decisionKind: 'appointment', customerDecision: 'appointed' }),
    ledgerEntry({ kind: 'customer.decision', flowId: 'flow-a', actorRoleId: 'verifier', power: 'acceptance', decisionKind: 'acceptance', customerDecision: 'accepted' }),
  ]);
  const svc = service(root);
  const steps = [];
  for (const stepId of ['impl', 'appointment-gate', 'verification']) {
    const parsed = parseFlowStateYaml(readFileSync(join(root, ...FLOW_REL.split('/')), 'utf8'), 'flow-a');
    const ev = parsed.flow.steps.find((s) => s.id === stepId).evidence;
    const r = await svc.update({ flowId: 'flow-a', stepId, status: 'done', evidence: { kind: ev.kind, ref: ev.ref }, expectedRevision: await rev(svc) });
    steps.push({ stepId, ok: r.ok, code: r.code });
  }
  const ledger = await readGovernanceLedger(root);
  rec('S9', steps.every((s) => s.ok === true) && (await observations(root)).length === 0 && ledger.entries.length === 3 && ledger.entries.filter((e) => e.kind === 'customer.decision').length === 2, JSON.stringify({ steps, ledgerEntries: ledger.entries.length, obs: (await observations(root)).length }));
});

// S10: batch observeFlowArtifacts (run-role/desktop batch path) -> observed/skipped semantics + idempotent
await withRoot(async (root) => {
  writeFile(root, 'docs/flows/flow-b.yaml', [
    'flowId: flow-b', 'version: 1', 'qualityTier: production', 'steps:',
    '  - id: a-ok', '    title: ok', '    owner: convener', '    kind: artifact', '    status: delivered', '    evidence: { kind: artifact, ref: docs/scheduling/ok.md }',
    '  - id: a-missing', '    title: missing', '    owner: convener', '    kind: artifact', '    status: delivered', '    evidence: { kind: artifact, ref: docs/scheduling/missing.md }',
    '  - id: a-excluded', '    title: excluded', '    owner: convener', '    kind: artifact', '    status: delivered', '    evidence: { kind: artifact, ref: .ans/secret.md }',
    '  - id: a-large', '    title: large', '    owner: convener', '    kind: artifact', '    status: delivered', '    evidence: { kind: artifact, ref: docs/scheduling/large.md }',
    '  - id: a-binary', '    title: binary', '    owner: convener', '    kind: artifact', '    status: delivered', '    evidence: { kind: artifact, ref: docs/scheduling/bin.md }', '',
  ].join('\n'));
  writeFile(root, 'docs/scheduling/ok.md', '# ok\n');
  writeFile(root, 'docs/scheduling/large.md', 'x'.repeat(2 * 1024 * 1024 + 1));
  writeFile(root, 'docs/scheduling/bin.md', Buffer.from([0x00, 0x01]));
  writeFile(root, '.ans/secret.md', 'x');
  const first = await observeFlowArtifacts({ projectRoot: root, flowId: 'flow-b' });
  const second = await observeFlowArtifacts({ projectRoot: root, flowId: 'flow-b' });
  const obs = await observations(root);
  const ok = first.ok === true && first.observed.length === 1 && first.observed[0] === 'docs/scheduling/ok.md' &&
    first.skipped.some((s) => s.reason === 'missing') && first.skipped.some((s) => s.reason === 'path-invalid') &&
    first.skipped.some((s) => s.reason === 'too-large') && first.skipped.some((s) => s.reason === 'binary') &&
    second.ok === true && second.observed.length === 0 && obs.length === 1;
  rec('S10', ok, JSON.stringify({ first: { ok: first.ok, observed: first.observed, skipped: first.skipped }, second: { ok: second.ok, observed: second.observed, skipped: second.skipped }, ledgerObs: obs.length }));
});

// S11: same-path observation with different flowId must NOT satisfy (file missing) -> insufficient-evidence, zero new
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  writeLedger(root, [ledgerEntry({ kind: 'artifact.observed', actorRoleId: 'convener', power: 'schedule', artifactPath: REF, artifactSha256: '1'.repeat(64), flowId: 'other-flow' })]);
  const svc = service(root);
  const r = await done(svc, REF, await rev(svc));
  const obs = await observations(root);
  rec('S11', r.ok === false && r.code === 'insufficient-evidence' && obs.length === 1, JSON.stringify({ ok: r.ok, code: r.code, error: r.error, obs: obs.length }));
});

// S12: same-path observation without flowId counts (upstream matching rule) -> success, no new observation
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  writeFile(root, REF, '# v5\n');
  writeLedger(root, [ledgerEntry({ kind: 'artifact.observed', actorRoleId: 'convener', power: 'schedule', artifactPath: REF })]);
  const svc = service(root);
  const r = await done(svc, REF, await rev(svc));
  const obs = await observations(root);
  rec('S12', r.ok === true && obs.length === 1 && obs[0].flowId === undefined, JSON.stringify({ ok: r.ok, code: r.code, obs: obs.length, entry: obs[0] }));
});

// S13: ref with leading ./ is normalized identically by observation and reconciliation -> success, one observation with normalized path
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml({ ref: './' + REF }));
  const content = '# v5\n';
  writeFile(root, REF, content);
  const svc = service(root);
  const r = await done(svc, './' + REF, await rev(svc));
  const obs = await observations(root);
  rec('S13', r.ok === true && obs.length === 1 && obs[0].artifactPath === REF && obs[0].artifactSha256 === sha256(Buffer.from(content)), JSON.stringify({ ok: r.ok, code: r.code, error: r.error, obs: obs.length, entry: obs[0] }));
});

// S14: concurrent observeFlowArtifacts + done -> no deadlock, done ok, exactly one same path+sha observation
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  const content = '# v5\n';
  writeFile(root, REF, content);
  const svc = service(root);
  const revision = await rev(svc);
  const [r, batch] = await Promise.all([done(svc, REF, revision), observeFlowArtifacts({ projectRoot: root, flowId: 'flow-a' })]);
  const obs = await observations(root);
  rec('S14', r.ok === true && batch.ok === true && obs.length === 1 && obs[0].artifactSha256 === sha256(Buffer.from(content)), JSON.stringify({ done: { ok: r.ok, code: r.code }, batch: { ok: batch.ok, observed: batch.observed }, obs: obs.length }));
});

// S15: directory (non-regular file) -> insufficient-evidence, zero observation
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  mkdirSync(join(root, ...REF.split('/')), { recursive: true });
  const svc = service(root);
  const r = await done(svc, REF, await rev(svc));
  rec('S15', r.ok === false && r.code === 'insufficient-evidence' && /missing/.test(r.error ?? '') && (await observations(root)).length === 0, JSON.stringify({ ok: r.ok, code: r.code, error: r.error }));
});

// S16: observation appended then flow write fails -> write-failed, one observation; retry succeeds without duplicate
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  writeFile(root, REF, '# v5\n');
  const svc = service(root);
  const revision = await rev(svc);
  const before = flowBytes(root);
  const failing = service(root, { writeFile: async () => { throw new Error('disk full'); } });
  const first = await done(failing, REF, revision);
  const flowUnchangedAfterFirst = flowBytes(root).equals(before);
  const afterFirst = await observations(root);
  const retry = await done(svc, REF, revision);
  const afterRetry = await observations(root);
  rec('S16', first.ok === false && first.code === 'write-failed' && flowUnchangedAfterFirst && afterFirst.length === 1 && retry.ok === true && afterRetry.length === 1 && stepStatus(root, 'change-package') === 'done', JSON.stringify({ first: { ok: first.ok, code: first.code }, flowUnchangedAfterFirst, obsAfterFirst: afterFirst.length, retry: { ok: retry.ok }, obsAfterRetry: afterRetry.length }));
});

// S17: padded ref (cannot reconcile) -> insufficient-evidence, zero observation
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, flowYaml());
  writeFile(root, REF, '# v5\n');
  const svc = service(root);
  const before = flowBytes(root);
  const r = await done(svc, ` ${REF} `, await rev(svc));
  rec('S17', r.ok === false && r.code === 'insufficient-evidence' && /path-invalid/.test(r.error ?? '') && (await observations(root)).length === 0 && flowBytes(root).equals(before), JSON.stringify({ ok: r.ok, code: r.code, error: r.error }));
});

// S18 (documented residual): step already done with no ledger observation -> idempotent short-circuit, no backfill
await withRoot(async (root) => {
  writeFile(root, FLOW_REL, [
    'flowId: flow-a', 'version: 1', 'qualityTier: production', 'steps:',
    '  - id: change-package', '    title: 变更包', '    owner: convener', '    kind: artifact', '    status: done',
    `    evidence: { kind: artifact, ref: ${JSON.stringify(REF)} }`,
    '  - id: verification', '    title: 验收', '    owner: verifier', '    kind: acceptance', '    status: pending', '',
  ].join('\n'));
  writeFile(root, REF, '# v5\n');
  const svc = service(root);
  const r = await done(svc, REF, await rev(svc));
  rec('S18', r.ok === true && r.idempotent === true && (await observations(root)).length === 0, JSON.stringify({ ok: r.ok, idempotent: r.idempotent, code: r.code, obs: (await observations(root)).length }));
});

const failed = results.filter((r) => !r.ok);
console.log(`SUMMARY total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
process.exitCode = failed.length ? 1 : 0;
