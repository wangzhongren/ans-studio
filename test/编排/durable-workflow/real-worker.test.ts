import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import type { DurableResult } from '../../../src/model/durable-workflow.ts';
import { openDurableWorkflow } from '../../../src/pipeline/orchestration/durable-workflow.ts';
import { createDaprHost } from '../../../src/pipeline/orchestration/dapr-host.ts';
import { fixture } from './fixture.ts';

const enabled = process.env.ANS_DURABLE_REAL_DAPR === '1';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function unwrap<T>(result: DurableResult<T>): T {
  if (!result.ok) assert.fail(result.code + ': ' + result.message);
  return (result as { value: T }).value;
}

test('actual Dapr continues a pinned instance and overdue timer after control plane and Worker restart',
  { skip: !enabled && 'set ANS_DURABLE_REAL_DAPR=1 after staging the bundled Dapr runtime', timeout: 150_000 }, async t => {
    const resourceRoot = process.cwd();
    const { project, dataDir, hostDir, definitions } = await fixture(t, join(resourceRoot, 'release-output'));
    const host = createDaprHost({ userDataRoot: hostDir, resourceRoot });
    let workflow = openDurableWorkflow({ dataDir, presetRoot: resourceRoot });
    try {
      const attach = async () => {
        const ready = await host.start();
        assert.equal(ready.state, 'ready', ready.diagnostic?.message ?? 'Dapr host readiness');
        assert.equal((await workflow.startWorker(ready.connection)).state, 'registered');
      };
      const until = async (predicate: () => boolean, phase: string) => {
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
          await workflow.reconcile();
          if (predicate()) return;
          await delay(250);
        }
        assert.fail('Timed out observing ' + phase + ': ' + JSON.stringify(workflow.activeProjections()));
      };

      await attach();
      const ref = unwrap(await workflow.start({ projectRoot: project, definitionId: 'read-only-example', requestId: 'real-1' })).ref;
      const graphRef = unwrap(await workflow.start({ projectRoot: project, definitionId: 'path-a',
        requestId: 'real-graph-2', source: 'preset', metadata: { summary: 'Build a racing game.', runtime: 'claude' } })).ref;
      await until(() => workflow.lookup(graphRef)?.pendingTasks?.length === 1, 'direct A1 task registered alongside legacy history');
      const intake = workflow.lookup(graphRef)!.pendingTasks![0]!;
      const request = { kind: 'stage-request' as const, source: 'chief' as const, key: 'stage-b1', stepId: 'inspect', attempt: 1,
        sourceTaskId: 'customer', requestDigest: hash('inspect'), dispatch: { text: 'inspect' } };
      unwrap(await workflow.submit(ref, request));
      await until(() => workflow.listFacts(ref).some(row => row.fact.key === 'stage-b1' && row.receipt.state === 'consumed'), 'stage request consumption');
      const before = host.status().processIds;
      assert.ok(before);
      await workflow.close();
      await host.stop();
      const config = join(definitions, 'read-only-example.yaml');
      await writeFile(config, (await readFile(config, 'utf8')).replace('version: 1', 'version: 2'));
      await delay(12_500);

      workflow = openDurableWorkflow({ dataDir, registeredContracts: [] });
      const returned = await workflow.startWorker();
      assert.equal(returned.state, 'incompatible');
      assert.equal(workflow.lookup(ref)?.engine, 'incompatible');
      await workflow.close();
      workflow = openDurableWorkflow({ dataDir, presetRoot: resourceRoot });
      await attach();
      assert.notEqual(host.status().processIds?.scheduler, before.scheduler);
      assert.notEqual(host.status().processIds?.daprd, before.daprd);
      const hasFiredTimer = () => {
        const db = new DatabaseSync(join(dataDir, 'ans-workflow.sqlite'), { readOnly: true });
        try {
          return db.prepare('SELECT 1 FROM activity WHERE instance_id=? AND business_key=?').get(ref.instanceId, 'timer:0') !== undefined;
        } finally {
          db.close();
        }
      };
      await until(hasFiredTimer, 'persisted overdue timer activity');
      assert.equal(workflow.lookup(ref)?.ref.definitionVersion, 1);
      await until(() => workflow.lookup(graphRef)?.engine === 'healthy', 'same graph executor resumes');
      assert.equal(workflow.lookup(graphRef)?.ref.activityContract, 2);
      assert.equal(workflow.lookup(graphRef)?.action, 'product-prepare-direct');
      assert.deepEqual(workflow.lookup(graphRef)?.pendingTasks, [intake]);
      const sendKey = 'model:' + intake.taskId;
      const address = { stepId: intake.stepId, attempt: intake.attempt };
      const send = unwrap(workflow.claimEffect(graphRef, { ...address, key: sendKey, kind: 'model-send', task: intake.task,
        expected: { roleId: 'product', runtime: 'claude', inputDigest: hash(intake.dispatch.text), clientMessageId: 'intake' } }));
      unwrap(workflow.settleEffect(graphRef, { key: sendKey, token: send.token, outcome: 'succeeded',
        evidence: 'test fixture model turn', result: { turnId: 'product-turn' } }));
      assert.equal(workflow.lookup(graphRef)?.stepId, intake.stepId);
      const intakeEvidence = unwrap(workflow.storeEvidence(graphRef, { report: { version: 1, reportId: 'intake-ready',
        taskId: intake.taskId, origin: 'submitted-report', status: 'completed', summary: { text: 'Ready' },
        source: { roleId: 'product', runtime: 'claude', turnId: 'product-turn' } } }));
      unwrap(await workflow.submitCapability(graphRef, { ...address, key: 'report:intake-ready', flowId: intake.flowId,
        source: { roleId: 'product', originId: 'product-turn', parentTaskId: intake.taskId },
        input: { kind: 'task-report', task: intake.task, evidence: intakeEvidence } }));
      await until(() => workflow.lookup(graphRef)?.stepId === 'write-intent', 'reported direct intake advances once after restart');
      assert.equal(unwrap(await workflow.validateDefinition(project, 'read-only-example')).version, 2);
      const task = { stage: 'readonly' as const, stageAttempt: 1, executionAttempt: 1, parentTaskId: 'parent', taskId: 'owner-1', roleId: 'owner' };
      const evidence = unwrap(workflow.storeEvidence(ref, { report: 'verified' }));
      unwrap(await workflow.submit(ref, { kind: 'task-report', source: 'host', key: 'report', stepId: 'inspect', attempt: 1, task, evidence }));
      unwrap(await workflow.submit(ref, { kind: 'task-bound', source: 'host', key: 'bound', stepId: 'inspect', attempt: 1, task }));
      unwrap(await workflow.submit(ref, { kind: 'readonly-review', source: 'convener', key: 'review', stepId: 'review', attempt: 1, outcome: 'accepted', reportKey: 'report' }));
      await until(() => workflow.lookup(ref)?.status === 'completed', 'same instance completes after restart');
      assert.equal(workflow.lookup(ref)?.pendingFacts, 0);
      t.diagnostic('Dapr Scheduler and daprd PID pairs changed; same SQLite instance and version 1 completed with one overdue timer receipt.');
    } finally {
      await workflow.close();
      await host.stop();
    }
  });
