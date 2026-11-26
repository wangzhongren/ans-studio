import assert from 'node:assert/strict';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import type { TestContext } from 'node:test';
import { PROJECT_MODULES_SCHEMA_EXAMPLE, PROJECT_ROSTER_SCHEMA_EXAMPLE, loadLatestRoster } from '../../../src/common/编排/workflow-preconditions.ts';
import type { DurableCapabilityEvent, DurableResult, DurableTaskBinding } from '../../../src/model/durable-workflow.ts';
import { DurableLedger, digest, stableJson } from '../../../src/provider/durable-workflow/public.ts';
import { documentRevisionOwner } from '../../../src/service/durable-workflow/document-revision.ts';
import { storedFact } from '../../../src/service/durable-workflow/facts.ts';
import { DurableWorkflowService, parseDefinition } from '../../../src/service/durable-workflow/public.ts';
import { fixture, git, pathAV7Source, pinPathAV7, pinPathAV8 } from './fixture.ts';

const present = () => true;
function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return result.value;
}

const paths = {
  proposal: 'docs/proposals/game-proposal-v1.md', rules: 'docs/product/game-intent-v1.md', roster: 'docs/proposals/game-roster-v1.md',
  modules: 'docs/proposals/game-modules-v1.md', architecture: 'docs/contracts/game-architecture-v1.md',
  criteria: 'docs/quality/game-criteria-v1.md', plan: 'docs/scheduling/game-team-v1.md',
};
const revisedProposal = paths.proposal.replace('-v1.', '-v2.');
const oldProposal = `---\nschema: project-proposal/v2\nflowId: game\nversion: 1\nintent: ${paths.rules}\n---\n# Racing proposal\nOwner coordination.\n`;
const newProposal = oldProposal + '\nFix the startup explanation.\n';
const oldCriteria = '# Racing criteria\n\n```ans-criteria\nschema: ans-criteria/v1\nflowId: game\nversion: 1\nstatus: final\ncriteria:\n  - id: AC-1\n    priority: P0\n    title: Steer the racing car\n```\n';
const newCriteria = oldCriteria.replace('Steer the racing car', 'Steer throughout the entire marked course');

async function seeded(t: TestContext, optedIn: boolean | 'audit' = false) {
  const { project, definitions, dataDir, cleanup } = await fixture(t);
  if (optedIn === 'audit') await writeFile(join(definitions, 'path-a.yaml'), await readFile(new URL('../../../docs/workflows/path-a.yaml', import.meta.url)));
  else if (optedIn) await pinPathAV8(definitions);
  else await pinPathAV7(definitions);
  const evidenceCollectorRoleId = optedIn === 'audit' ? 'acceptance-evidence-collector' : undefined;
  const roleId = evidenceCollectorRoleId ?? 'implementer';
  const writePath = evidenceCollectorRoleId ? 'docs/verification/game/' : 'src/';
  const moduleId = evidenceCollectorRoleId ? 'acceptance-evidence' : 'core';
  const forFlow = (template: string) => {
    const current = template.replaceAll('demo', 'game');
    return evidenceCollectorRoleId ? current.replaceAll('core', moduleId).replace('category: acceptance-evidence', 'category: evidence')
      .replaceAll('src/', writePath).replaceAll('implementer', roleId) : current;
  };
  const files = await Promise.all(Object.entries({
    [paths.proposal]: oldProposal, [paths.rules]: '# Racing intent\n',
    [paths.roster]: forFlow(PROJECT_ROSTER_SCHEMA_EXAMPLE).replace('<小项目省略理由；默认项目不要照抄>', 'Single small module'),
    [paths.modules]: forFlow(PROJECT_MODULES_SCHEMA_EXAMPLE),
    [paths.architecture]: `---\nschema: project-architecture/v1\nflowId: game\nversion: 1\n---\n# Architecture\nSee ${paths.proposal}.\n`,
  }).map(async ([file, text]) => {
    await mkdir(dirname(join(project, file)), { recursive: true });
    await writeFile(join(project, file), text);
    return { path: file, sha256: digest(text) };
  }));
  const write = async (file: string, text: string) => {
    await mkdir(dirname(join(project, file)), { recursive: true });
    await writeFile(join(project, file), text);
    return { path: file, sha256: digest(text) };
  };
  const planRefs = files.filter(file => file.path === paths.modules || file.path === paths.roster);
  const planContent = `---\nschema: teamPlanSchema:3\nflowId: game\nversion: 1\n${planRefs.map(file => `${file.path === paths.modules ? 'modules' : 'roster'}: { path: ${file.path}, sha256: ${file.sha256} }`).join('\n')}\nroleRows:\n  - roleId: ${roleId}\n    modules: [${moduleId}]\n    writesets: [${writePath}]\n    dependsOn: []\n---\n# Fixed plan\n`;
  const plan = await write(paths.plan, planContent);
  const criteria = await write(paths.criteria, oldCriteria);
  const roleDocuments = await Promise.all(['role-card.md', 'boundary.md', 'boundary.yaml'].map(file => write(`角色卡/${roleId}/` + file, '# Role evidence\n')));
  let service = new DurableWorkflowService(dataDir, process.cwd());
  cleanup.push(() => service.close());
  const source = 'project';
  const selected = unwrap(await service.validateDefinition(project, 'path-a', { source }));
  assert.equal(selected.version, evidenceCollectorRoleId ? 9 : optedIn ? 8 : 7);
  const text = 'Develop a 3D racing game.';
  const proposed = unwrap(await service.proposeWorkflowStart({ projectRoot: project, definitionId: 'path-a', source,
    reason: 'New build', expectedDigest: selected.digest,
    requirement: { inputId: 'draft-racing', turnId: 'select', text, digest: digest(text), runtime: 'claude' } }, present));
  unwrap(await service.decideWorkflowStart({ projectRoot: project, activationId: proposed.activationId, requestId: proposed.requestId, action: 'approve' }, present));
  const ref = unwrap(await service.startApprovedWorkflow(project, proposed.activationId, present)).instanceRef!;
  service.close();
  const ledger = new DurableLedger(dataDir);
  const parent: DurableTaskBinding = { stage: 'A11', stageAttempt: 1, executionAttempt: 1, taskId: 'current-ops', parentTaskId: ref.instanceId, roleId: 'convener' };
  const addr = { stepId: 'implement', attempt: 1 };
  const proof = 'approved-proposal';
  ledger.transaction(() => {
    const value = ledger.instance(ref.instanceId)!;
    value.stepId = addr.stepId;
    value.entry = 15;
    value.engine = 'healthy';
    value.baseline = { branch: git(project, 'branch', '--show-current'), oid: git(project, 'rev-parse', 'HEAD') };
    Object.assign(value.graph!, { flowId: 'game', expectedRoles: [roleId], activatedRoles: [roleId],
      proposalRoster: files.find(file => file.path === paths.roster), approvedProposalRequestId: proof,
      writeSets: [{ roleId, paths: [writePath] }], proofs: { 'team-plan': 'team', 'standard-open': 'closed-standard' } });
    value.graph!.tasks.push({ ...addr, flowId: 'game', taskId: parent.taskId, roleId: parent.roleId, task: parent, state: 'pending',
      capability: 'operations-implementation', dispatch: { actor: 'application', flowId: 'game', text: 'Implement racing game.' } });
    const standard: DurableTaskBinding = { stage: 'A12a', stageAttempt: 1, executionAttempt: 1, taskId: 'verify-standard', parentTaskId: ref.instanceId, roleId: 'verifier' };
    value.graph!.tasks.push({ stepId: 'open-standard', attempt: 1, flowId: 'game', taskId: standard.taskId,
      roleId: standard.roleId, task: standard, state: 'accepted', outcome: 'accepted', baselineOid: value.baseline.oid,
      documents: [criteria], capability: 'independent-standard', dispatch: { actor: 'application', flowId: 'game', text: 'Independent criteria.' } });
    const save = (key: string, input: DurableCapabilityEvent['input'], stepId = 'confirm-proposal') => {
      const event = { key, stepId, attempt: 1, flowId: 'game', source: { roleId: 'host', originId: ref.instanceId }, input };
      ledger.saveFact(ref.instanceId, storedFact({ kind: 'capability-event', source: 'host', key, stepId: event.stepId, attempt: 1, event }, { key, state: 'consumed' }));
    };
    save('card', { kind: 'card-prepared', card: { requestId: proof, cardKind: 'proposal', digest: digest('proposal'), documents: files, generation: 1 } });
    save('decided', { kind: 'card-decided', requestId: proof, digest: digest('proposal'), generation: 1, decision: 'approve', authority: 'customer' });
    save('team', { kind: 'baseline-verified', effectKey: 'baseline', branch: value.baseline!.branch, baselineOid: value.baseline!.oid, documents: [plan] });
    save('activated-role', { kind: 'role-activated', proposalRequestId: proof, roleId, documents: roleDocuments });
    save('closed-standard', { kind: 'task-closed', task: standard, reportKey: 'standard-report', outcome: 'accepted', documents: [criteria] }, 'open-standard');
    ledger.save(value);
  });
  ledger.close();
  service = new DurableWorkflowService(dataDir, process.cwd());
  const claim = (task: DurableTaskBinding, key: string, turn: string) => {
    const effect = unwrap(service.claimEffect(ref, { ...addr, key, kind: 'model-send', task, expected: { roleId: task.roleId } }));
    if (effect.execute) unwrap(service.settleEffect(ref, { key, token: effect.token, outcome: 'succeeded', evidence: 'Observed test turn.', result: { turnId: turn } }));
    return effect;
  };
  claim(parent, 'model:' + parent.taskId, 'ops-turn');
  const request = { path: paths.proposal, reason: 'The documented launch sequence is incomplete.',
    source: { roleId: 'convener', originId: 'ops-turn', parentTaskId: parent.taskId } };
  const restart = () => {
    service.close();
    service = new DurableWorkflowService(dataDir, process.cwd());
    return service;
  };
  return { project, dataDir, ref, parent, addr, service, restart, claim, request, planContent, evidenceCollectorRoleId };
}

test('only current flow built-in paths resolve to the fixed author', () => {
  const owner = (path: string) => documentRevisionOwner(path, 'game', ['implementer'])?.role;
  assert.equal(owner(paths.proposal), 'rapporteur');
  assert.equal(owner(paths.architecture), 'rapporteur');
  assert.equal(owner(paths.modules), 'rapporteur');
  assert.equal(owner(paths.roster), 'rapporteur');
  assert.equal(owner(paths.rules), 'product');
  assert.equal(owner('docs/scheduling/game-team-v1.md'), 'convener');
  assert.equal(owner('docs/quality/game-criteria-v1.md'), 'verifier');
  assert.equal(owner('docs/quality/game-report-v1.md'), 'verifier');
  assert.equal(owner('角色卡/implementer/boundary.yaml'), 'nominator');
  for (const invalid of ['C:/project/' + paths.proposal, '../' + paths.proposal, paths.proposal.replaceAll('/', '\\'),
    paths.proposal.replace('game-', 'foreign-'), '角色卡/unassigned/role-card.md', 'src/main.ts', 'docs/workflows/path-a.yaml']) {
    assert.equal(owner(invalid), undefined);
  }
});

test('revision enables only as an accepted A11 step key and preserves v5 and v6 shapes', async () => {
  const text = (await pathAV7Source()).replaceAll('\r\n', '\n');
  assert.ok(parseDefinition(text).ok);
  assert.equal(parseDefinition(text.replace('documentRevision: true', 'documentRevision: false')).ok, false);
  assert.equal(parseDefinition(text.replace('    documentRevision: true\n', '').replace('    action: author-proposal',
    '    documentRevision: true\n    action: author-proposal')).ok, false);
  const v6 = text.replace('version: 7', 'version: 6').replace(', environment-missing: open-recovery', '')
    .replace(/  open-recovery:\n[\s\S]+?(?=  revise-implementation:)/, '');
  const prior = unwrap(parseDefinition(v6));
  assert.equal(prior.version, 6);
  assert.equal(Object.hasOwn(prior.steps.implement!, 'documentRevision'), true);
  const earlier = unwrap(parseDefinition(v6.replace('version: 6', 'version: 5').replace('    documentRevision: true\n', '')));
  assert.equal(earlier.version, 5);
  assert.equal(Object.hasOwn(earlier.steps.implement!, 'documentRevision'), false);
});

for (const optedIn of [false, true, 'audit'] as const) test(`an approved immutable ${optedIn === 'audit' ? 'v9 evidence roster' : optedIn ? 'v8 routed' : 'legacy'} proposal revision reopens the original A11`, async t => {
  const f = await seeded(t, optedIn);
  let service = f.service;
  assert.equal(service.lookup(f.ref)?.documentRevisionEnabled, true);
  assert.equal((await service.requestDocumentRevision(f.ref, { ...f.request, source: { ...f.request.source, roleId: 'chief' } }, present)).ok, false);
  assert.equal((await service.requestDocumentRevision(f.ref, { ...f.request, path: revisedProposal }, present)).ok, false);
  let request = f.request;
  let scopeRequestId: string | undefined;
  if (optedIn) {
    assert.equal((await service.requestDocumentRevision(f.ref, request, present)).ok, false);
    const scope = service.lookup(f.ref)!.blockedRouting!;
    scopeRequestId = scope.binding.requestId;
    const wake = 'model:a11-scope-revise:' + scopeRequestId;
    assert.equal(service.claimEffect(f.ref, { ...f.addr, kind: 'model-send', key: wake, task: f.parent, expected: { roleId: 'convener' } }).ok, false);
    unwrap(await service.decideBlockedScopeChange(f.ref, { ...scope.binding, option: 'revise', provenance: { source: 'customer' } }, present));
    f.claim(f.parent, wake, 'scope-turn');
    assert.equal((await service.requestDocumentRevision(f.ref, request, present)).ok, false);
    request = { ...request, source: { ...request.source, originId: 'scope-turn' } };
  }
  const revision = unwrap(await service.requestDocumentRevision(f.ref, request, present));
  assert.equal(revision.roleId, 'rapporteur');
  assert.equal(revision.task.parentTaskId, f.parent.taskId);
  assert.equal(unwrap(await service.requestDocumentRevision(f.ref, request, present)).id, revision.id);
  assert.equal((await service.requestDocumentRevision(f.ref, { ...f.request, reason: 'Concurrent correction' }, present)).ok, false);
  assert.deepEqual(service.apply({ ref: f.ref, ...f.addr, entry: 15, turn: 0 }), { entry: 15 });
  assert.equal(service.claimEffect(f.ref, { ...f.addr, kind: 'task-write', key: 'bypass', task: revision.task,
    expected: { paths: [revisedProposal] } }).ok, false);
  f.claim(revision.task, 'model:' + revision.task.taskId, 'planner-turn');
  const submission = { revisionId: revision.id, content: newProposal,
    source: { roleId: 'rapporteur', originId: 'planner-turn', parentTaskId: revision.task.taskId } };
  assert.equal((await service.submitDocumentRevision(f.ref, submission, () => false)).ok, false);
  assert.equal((await service.submitDocumentRevision(f.ref, { ...submission, content: newProposal.replace('project-proposal/v2', 'unknown/v1') }, present)).ok, false);
  const waiting = unwrap(await service.submitDocumentRevision(f.ref, submission, present));
  assert.equal(waiting.status, 'awaiting-approval');
  await assert.rejects(readFile(join(f.project, revisedProposal)));
  assert.equal(await readFile(join(f.project, paths.proposal), 'utf8'), oldProposal);
  service = f.restart();
  assert.equal(service.lookup(f.ref)?.documentRevision?.status, 'awaiting-approval');
  const review = unwrap(await service.readDocumentRevisionReview(f.ref, revision.id));
  assert.equal(review.digest, waiting.reviewDigest);
  assert.equal(review.documents.length, 3);
  assert.equal(review.originalContent, oldProposal);
  assert.match(review.candidateContent, /Fix the startup explanation/);
  const decision = { revisionId: revision.id, digest: review.digest, authority: 'customer', decision: 'approve' } as const;
  assert.equal((await service.decideDocumentRevision(f.ref, decision, () => false)).ok, false);
  assert.equal((await service.decideDocumentRevision(f.ref, { ...decision, digest: 'stale' }, present)).ok, false);
  assert.equal(unwrap(await service.decideDocumentRevision(f.ref, decision, present)).status, 'ready');
  // Model a crash after the exclusive link and before removing the application's temporary hardlink.
  const interrupted = new DurableLedger(f.dataDir);
  interrupted.transaction(() => {
    const value = interrupted.instance(f.ref.instanceId)!;
    value.graph!.documentRevisions!.at(-1)!.status = 'applying';
    interrupted.save(value);
  });
  interrupted.close();
  const main = review.documents[0]!;
  const temporary = join(f.project, dirname(main.path), '.workflow-revision-' + digest(stableJson([main.path, main.sha256])) + '.tmp');
  await writeFile(temporary, review.candidateContent);
  await link(temporary, join(f.project, main.path));
  service = f.restart();
  const resumed = unwrap(await service.resumeDocumentRevision(f.ref));
  assert.equal(resumed.status, 'resumed');
  assert.deepEqual(resumed.origin, revision.origin);
  assert.equal(service.lookup(f.ref)?.stepId, f.addr.stepId);
  assert.equal(service.lookup(f.ref)?.attempt, f.addr.attempt);
  assert.equal(await readFile(join(f.project, paths.proposal), 'utf8'), oldProposal);
  assert.equal(await readFile(join(f.project, revisedProposal), 'utf8'), review.candidateContent);
  await assert.rejects(readFile(temporary));
  const roster = await loadLatestRoster({ projectRoot: f.project, flowId: 'game', evidenceCollectorRoleId: f.evidenceCollectorRoleId });
  assert.equal(roster.ok && roster.roster.proposal, revisedProposal);
  if (f.evidenceCollectorRoleId) assert.equal((await loadLatestRoster({ projectRoot: f.project, flowId: 'game' })).ok, false);
  if (scopeRequestId) {
    assert.ok(service.lookup(f.ref)?.blockedRouting);
    unwrap(await service.resumeBlockedScopeChange(f.ref, scopeRequestId, undefined, present));
    assert.equal(service.lookup(f.ref)?.blockedRouting, undefined);
  }
  const key = 'model:a11-revision-resume:' + revision.id;
  assert.equal(f.claim(f.parent, key, 'ops-resume').execute, true);
  assert.equal(f.claim(f.parent, key, 'ops-resume').execute, false);
  assert.deepEqual(service.apply({ ref: f.ref, ...f.addr, entry: 15, turn: 1 }), { entry: 15 });
  assert.equal(service.listFacts(f.ref).filter(row => row.fact.kind === 'document-revision' && row.fact.state === 'resumed').length, 1);
});

test('rejecting an exact revision leaves the old authority and does not permit an A11 wake', async t => {
  const f = await seeded(t);
  const revision = unwrap(await f.service.requestDocumentRevision(f.ref, f.request, present));
  f.claim(revision.task, 'model:' + revision.task.taskId, 'planner-turn');
  const waiting = unwrap(await f.service.submitDocumentRevision(f.ref, { revisionId: revision.id, content: newProposal,
    source: { roleId: 'rapporteur', originId: 'planner-turn', parentTaskId: revision.task.taskId } }, present));
  const rejected = unwrap(await f.service.decideDocumentRevision(f.ref, { revisionId: revision.id, digest: waiting.reviewDigest!,
    authority: 'customer', decision: 'reject' }, present));
  assert.equal(rejected.status, 'blocked');
  assert.equal(f.service.claimEffect(f.ref, { ...f.addr, kind: 'model-send', task: f.parent, expected: { roleId: 'convener' },
    key: 'model:a11-revision-resume:' + revision.id }).ok, false);
  await assert.rejects(readFile(join(f.project, revisedProposal)));
  assert.equal(await readFile(join(f.project, paths.proposal), 'utf8'), oldProposal);
  assert.equal(f.service.lookup(f.ref)?.stepId, 'implement');
});

test('delegated revision settlement rechecks its candidate and leaves one recoverable approval', async t => {
  const f = await seeded(t);
  const revision = unwrap(await f.service.requestDocumentRevision(f.ref, f.request, present));
  f.claim(revision.task, 'model:' + revision.task.taskId, 'planner-turn');
  unwrap(await f.service.submitDocumentRevision(f.ref, { revisionId: revision.id, content: newProposal,
    source: { roleId: revision.roleId, originId: 'planner-turn', parentTaskId: revision.task.taskId } }, present));
  const review = unwrap(await f.service.readDocumentRevisionReview(f.ref, revision.id));
  const binding = { requestId: review.requestId, digest: review.digest, generation: review.generation };
  const provenance = { source: 'delegated-chief', ...binding, delegationRevision: 3, reason: 'The candidate preserves the original scope.' } as const;
  const decision = { revisionId: revision.id, ...binding, decision: 'approve', authority: 'delegated-chief', provenance } as const;
  assert.equal((await f.service.decideDocumentRevision(f.ref, decision)).ok, false);
  assert.equal((await f.service.decideDocumentRevision(f.ref, { ...decision, provenance: { ...provenance, requestId: 'other-request' } }, present)).ok, false);
  assert.equal((await f.service.decideDocumentRevision(f.ref, { ...decision, authority: 'customer' }, present)).ok, false);
  let checks = 0;
  assert.equal((await f.service.decideDocumentRevision(f.ref, decision, () => ++checks === 1)).ok, false);
  await assert.rejects(readFile(join(f.project, revisedProposal)), { code: 'ENOENT' });
  const approved = unwrap(await f.service.decideDocumentRevision(f.ref, decision, present));
  assert.deepEqual(approved.approval?.provenance, provenance);
  assert.equal((await f.service.decideDocumentRevision(f.ref, { ...decision, decision: 'reject' }, present)).ok, false);
  await assert.rejects(readFile(join(f.project, revisedProposal)), { code: 'ENOENT' });
  const recovered = f.restart();
  assert.deepEqual(unwrap(await recovered.decideDocumentRevision(f.ref, decision, present)).approval, approved.approval);
  const applied = await Promise.all([recovered.resumeDocumentRevision(f.ref), recovered.resumeDocumentRevision(f.ref)]);
  assert.equal(unwrap(applied[0]!).status, 'resumed');
  assert.equal(unwrap(applied[1]!).status, 'resumed');
  assert.equal(await readFile(join(f.project, revisedProposal), 'utf8'), review.candidateContent);
  assert.equal(recovered.listFacts(f.ref).filter(row => row.fact.kind === 'document-revision' && row.fact.state === 'resumed').length, 1);
});

test('an active A12a revision rejects invalid flow, schema, status and version before composing the next valid standard', async t => {
  const f = await seeded(t);
  const revision = unwrap(await f.service.requestDocumentRevision(f.ref,
    { ...f.request, path: paths.criteria, reason: 'Specify the marked course.' }, present));
  assert.equal(revision.roleId, 'verifier');
  f.claim(revision.task, 'model:' + revision.task.taskId, 'verifier-turn');
  const candidate = { revisionId: revision.id, content: newCriteria,
    source: { roleId: 'verifier', originId: 'verifier-turn', parentTaskId: revision.task.taskId } };
  for (const content of ['# no criteria block', newCriteria.replace('flowId: game', 'flowId: foreign'),
    newCriteria.replace('ans-criteria/v1', 'ans-criteria/v2'), newCriteria.replace('status: final', 'status: draft'),
    newCriteria.replace('version: 1', 'version: 3')]) {
    assert.equal((await f.service.submitDocumentRevision(f.ref, { ...candidate, content }, present)).ok, false);
    assert.equal(f.service.lookup(f.ref)?.documentRevision?.status, 'pending');
  }
  const revised = unwrap(await f.service.submitDocumentRevision(f.ref, candidate, present));
  assert.equal(revised.status, 'awaiting-approval');
  const current = unwrap(await f.service.readDocumentRevisionReview(f.ref, revised.id));
  assert.match(current.candidateContent, /version: 2/);
  await assert.rejects(readFile(join(f.project, paths.criteria.replace('-v1.', '-v2.'))));
  unwrap(await f.service.decideDocumentRevision(f.ref, { revisionId: revised.id, digest: current.digest, decision: 'approve', authority: 'customer' }, present));
  assert.equal(unwrap(await f.service.resumeDocumentRevision(f.ref)).status, 'resumed');
  assert.equal(await readFile(join(f.project, paths.criteria), 'utf8'), oldCriteria);
  assert.deepEqual(f.service.lookup(f.ref)?.pendingTasks?.find(task => task.capability === 'independent-standard')?.documents, current.documents);
});

test('a missing approved A12a standard restores only exact originally approved final bytes', async t => {
  const f = await seeded(t);
  await unlink(join(f.project, paths.criteria));
  const revision = unwrap(await f.service.requestDocumentRevision(f.ref,
    { ...f.request, path: paths.criteria, reason: 'Approved standard file is missing.' }, present));
  f.claim(revision.task, 'model:' + revision.task.taskId, 'verifier-turn');
  const candidate = { revisionId: revision.id, content: newCriteria,
    source: { roleId: 'verifier', originId: 'verifier-turn', parentTaskId: revision.task.taskId } };
  assert.equal((await f.service.submitDocumentRevision(f.ref, candidate, present)).ok, false);
  assert.equal(unwrap(await f.service.submitDocumentRevision(f.ref, { ...candidate, content: oldCriteria }, present)).status, 'ready');
  assert.equal(unwrap(await f.service.resumeDocumentRevision(f.ref)).status, 'resumed');
  assert.equal(await readFile(join(f.project, paths.criteria), 'utf8'), oldCriteria);
});

test('a compatible team-plan revision uses real pinned references and cannot expand assigned write paths', async t => {
  const f = await seeded(t);
  const revision = unwrap(await f.service.requestDocumentRevision(f.ref,
    { ...f.request, path: paths.plan, reason: 'Clarify review order.' }, present));
  assert.equal(revision.roleId, 'convener');
  assert.notEqual(revision.task.taskId, f.parent.taskId);
  f.claim(revision.task, 'model:' + revision.task.taskId, 'revision-convener-turn');
  const candidate = { revisionId: revision.id, content: f.planContent + '\nReview the approved module after implementation.\n',
    source: { roleId: 'convener', originId: 'revision-convener-turn', parentTaskId: revision.task.taskId } };
  assert.equal((await f.service.submitDocumentRevision(f.ref, { ...candidate, content: candidate.content.replace('writesets: [src/]', 'writesets: [other/]') }, present)).ok, false);
  const waiting = unwrap(await f.service.submitDocumentRevision(f.ref, candidate, present));
  assert.equal(waiting.status, 'awaiting-approval');
  unwrap(await f.service.decideDocumentRevision(f.ref, { revisionId: revision.id, digest: waiting.reviewDigest!, decision: 'approve', authority: 'customer' }, present));
  assert.equal(unwrap(await f.service.resumeDocumentRevision(f.ref)).status, 'resumed');
  assert.equal(await readFile(join(f.project, paths.plan), 'utf8'), f.planContent);
});
