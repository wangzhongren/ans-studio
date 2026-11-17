import { DaprWorkflowClient, WorkflowRuntime, WorkflowRuntimeStatus } from '@dapr/dapr';
import type { Task, WorkflowContext } from '@dapr/dapr';
import { DURABLE_ACTIVITY, DURABLE_ACTIVITY_CONTRACT, DURABLE_EXECUTOR, DURABLE_WAKE_EVENT, DURABLE_GRAPH_ACTIVITY,
  DURABLE_GRAPH_ACTIVITY_CONTRACT, DURABLE_GRAPH_EXECUTOR, DURABLE_GRAPH_WAKE_EVENT } from '../../model/durable-workflow.ts';
import type { DurableConnection, DurableDefinitionSnapshot, DurableInstanceRef, DurableWorkerStatus } from '../../model/durable-workflow.ts';
import { DurableWorkflowService } from '../../service/durable-workflow/public.ts';
import type { ActivityInput, ActivityOutcome } from '../../service/durable-workflow/public.ts';

type Execution = { ref: DurableInstanceRef; definition: DurableDefinitionSnapshot };
type Wake = { ref: DurableInstanceRef; key: string };
type Contract = { executor: string; activityContract: number };

export interface OpenDurableWorkflowOptions {
  dataDir: string;
  presetRoot?: string;
  connection?: DurableConnection;
  registeredContracts?: readonly Contract[];
}

const compiledContract: Contract = { executor: DURABLE_EXECUTOR, activityContract: DURABLE_ACTIVITY_CONTRACT };
const graphContract: Contract = { executor: DURABLE_GRAPH_EXECUTOR, activityContract: DURABLE_GRAPH_ACTIVITY_CONTRACT };
const compiled = [compiledContract, graphContract];

function sameRef(first: DurableInstanceRef, second: DurableInstanceRef | undefined): boolean {
  return second !== undefined && first.projectId === second.projectId && first.instanceId === second.instanceId
    && first.definitionId === second.definitionId && first.definitionVersion === second.definitionVersion
    && first.definitionDigest === second.definitionDigest && first.executor === second.executor
    && first.activityContract === second.activityContract;
}

function* executeDefinition(ctx: WorkflowContext, input: Execution): Generator<Task<unknown>, string, unknown> {
  const { ref, definition } = input;
  if (ref.instanceId !== ctx.getWorkflowInstanceId() || ref.executor !== ctx.getWorkflowName()
    || ref.definitionDigest !== definition.digest || ref.definitionId !== definition.id || ref.definitionVersion !== definition.version) {
    throw new Error('固定工作流输入的身份不匹配。');
  }
  const activity = definition.schema === 2 ? DURABLE_GRAPH_ACTIVITY : DURABLE_ACTIVITY;
  const wakeEvent = definition.schema === 2 ? DURABLE_GRAPH_WAKE_EVENT : DURABLE_WAKE_EVENT;
  let stepId = definition.start;
  let entry = 0;
  while (true) {
    if (!Object.hasOwn(definition.steps, stepId)) throw new Error('固定工作流缺少目标步骤。');
    let markTimer = false;
    const timer = ctx.createTimer(12);
    let timerActive = true;
    for (let turn = 0; ; turn++) {
      const request: ActivityInput = { ref, stepId, entry, turn, ...(markTimer ? { timer: true } : {}) };
      const result = (yield ctx.callActivity<ActivityOutcome>(activity, request)) as ActivityOutcome;
      markTimer = false;
      if (result.terminal) {
        if (timerActive) timer.cancel();
        return result.terminal;
      }
      if (result.next) {
        if (timerActive) timer.cancel();
        stepId = result.next;
        entry = result.entry;
        break;
      }
      while (true) {
        const wake = ctx.waitForExternalEvent<Wake>(wakeEvent);
        if (timerActive) {
          const winner = yield ctx.whenAny([wake, timer]);
          if (winner === timer) {
            wake.cancel();
            timerActive = false;
            markTimer = true;
            break;
          }
        }
        const incoming = (yield wake) as Wake | undefined;
        if (incoming && sameRef(ref, incoming.ref) && typeof incoming.key === 'string') break;
      }
    }
  }
}

export function openDurableWorkflow(options: OpenDurableWorkflowOptions) {
  const service = new DurableWorkflowService(options.dataDir, options.presetRoot);
  const registered = compiled.filter(item => !options.registeredContracts || options.registeredContracts.some(selected =>
    item.executor === selected.executor && item.activityContract === selected.activityContract));
  let runtime: WorkflowRuntime | undefined;
  let client: DaprWorkflowClient | undefined;
  let reconciliation: Promise<void> | undefined;
  let closed = false;
  let status: DurableWorkerStatus = { state: 'pending', ...compiledContract };

  const setStatus = (state: DurableWorkerStatus['state'], reason?: string): DurableWorkerStatus => {
    status = { state, reason, ...compiledContract };
    return status;
  };

  async function startWorker(connection = options.connection): Promise<DurableWorkerStatus> {
    if (closed) throw new Error('持久工作流已关闭。');
    if (runtime) return status;
    const incompatibility = service.checkCompatibility(registered);
    if (incompatibility || !registered.length) {
      const reason = incompatibility ?? '当前应用缺少工作流注册。';
      service.engineStatus('incompatible', reason);
      return setStatus('incompatible', reason);
    }
    if (!connection || connection.daprHost !== '127.0.0.1' || !/^[0-9]{1,5}$/.test(connection.daprPort)
      || Number(connection.daprPort) < 1 || Number(connection.daprPort) > 65535) {
      const reason = '本地 Dapr gRPC 连接未就绪。';
      service.engineStatus('offline', reason);
      return setStatus('offline', reason);
    }
    const { daprHost, daprPort, daprApiToken } = connection;
    const candidate = new WorkflowRuntime({ daprHost, daprPort, daprApiToken });
    const candidateClient = new DaprWorkflowClient({ daprHost, daprPort, daprApiToken });
    for (const contract of registered) {
      const activity = contract.activityContract === DURABLE_GRAPH_ACTIVITY_CONTRACT ? DURABLE_GRAPH_ACTIVITY : DURABLE_ACTIVITY;
      candidate.registerWorkflowByName(contract.executor, executeDefinition);
      candidate.registerActivityWithName<ActivityInput, ActivityOutcome>(activity, (context, input) => {
        if (context.getWorkflowInstanceId() !== input.ref.instanceId || input.ref.executor !== contract.executor
          || input.ref.activityContract !== contract.activityContract) throw new Error('活动调用的实例或契约不匹配。');
        return service.apply(input);
      });
    }
    try {
      await candidate.start();
      runtime = candidate;
      client = candidateClient;
      return setStatus('registered');
    } catch (error) {
      await Promise.allSettled([candidate.stop(), candidateClient.stop()]);
      const reason = '无法连接 Dapr Workflow Worker：' + (error instanceof Error ? error.message : String(error));
      service.engineStatus('offline', reason);
      return setStatus('offline', reason);
    }
  }

  async function reconcileWorker(): Promise<void> {
    const worker = runtime;
    const dapr = client;
    if (!worker || !dapr || closed) return;
    if (!worker.isReady) {
      service.engineStatus('offline', '本地 Workflow Worker 正在重连。');
      setStatus('offline', '本地 Workflow Worker 正在重连。');
      return;
    }
    setStatus('registered');
    const resumable = new Map<string, DurableInstanceRef>();
    for (const input of service.engineInputs()) {
      try {
        const id = input.ref.instanceId;
        const history = await dapr.getWorkflowState(id, true, AbortSignal.timeout(4000));
        if (!history?.exists) {
          if (input.scheduled) {
            service.engineStatus('history-missing', '已登记实例的持久引擎历史缺失。', input.ref);
            continue;
          }
          service.markScheduling(input.ref, false);
          const scheduledId = await dapr.scheduleNewWorkflow(input.ref.executor,
            { ref: input.ref, definition: input.definition } satisfies Execution, id, undefined, AbortSignal.timeout(4000));
          if (scheduledId !== id) throw new Error('Dapr 返回不同的工作流实例 ID。');
          service.markScheduling(input.ref, true);
        } else {
          const stored = history.getInput<Execution>();
          if (!sameRef(input.ref, stored?.ref) || stored?.definition.digest !== input.definition.digest
            || history.name !== input.ref.executor || ![
              WorkflowRuntimeStatus.RUNNING, WorkflowRuntimeStatus.PENDING,
            ].includes(history.runtimeStatus)) {
            if (service.lookup(input.ref)?.status === 'waiting') {
              service.engineStatus('history-missing', '引擎历史身份或执行状态与 ANS 事实不一致。', input.ref);
            }
            continue;
          }
          if (!input.scheduled) service.markScheduling(input.ref, true);
          service.engineStatus('healthy', undefined, input.ref);
          resumable.set(id, input.ref);
        }
      } catch (error) {
        service.engineStatus('offline', '无法核对本地工作流历史：' + (error instanceof Error ? error.message : String(error)), input.ref);
      }
    }
    for (const item of service.pendingOutbox()) {
      const ref = resumable.get(item.instanceId);
      if (!ref) continue;
      try {
        const wakeEvent = ref.activityContract === DURABLE_GRAPH_ACTIVITY_CONTRACT ? DURABLE_GRAPH_WAKE_EVENT : DURABLE_WAKE_EVENT;
        await dapr.raiseEvent(item.instanceId, wakeEvent, { ref, key: item.key } satisfies Wake, AbortSignal.timeout(4000));
        service.postponeOutbox(item, true);
      } catch {
        service.postponeOutbox(item, false);
      }
    }
  }

  function reconcile(): Promise<void> {
    reconciliation ??= reconcileWorker().finally(() => { reconciliation = undefined; });
    return reconciliation;
  }

  async function stopWorker(): Promise<void> {
    const stoppingRuntime = runtime;
    const stoppingClient = client;
    runtime = undefined;
    client = undefined;
    await reconciliation;
    await Promise.allSettled([stoppingRuntime?.stop(), stoppingClient?.stop()]);
    if (stoppingRuntime) service.engineStatus('offline', '本地工作流 Worker 已停止。');
    setStatus('pending');
  }

  async function close(): Promise<void> {
    if (closed) return;
    closed = true;
    await stopWorker();
    service.close();
  }

  return {
    listDefinitions: service.listDefinitions.bind(service), validateDefinition: service.validateDefinition.bind(service),
    copyPreset: service.copyPreset.bind(service), importDefinition: service.importDefinition.bind(service),
    start: service.start.bind(service), owner: service.owner.bind(service), projection: service.projection.bind(service),
    lookup: service.lookup.bind(service), activeProjections: service.activeProjections.bind(service),
    submitCapability: service.submitCapability.bind(service), listCapabilityEvents: service.listCapabilityEvents.bind(service),
    graphCardDigest: service.graphCardDigest, bindRepository: service.bindRepository.bind(service),
    withDomainOperation: service.withDomainOperation.bind(service), checkExistingBaseline: service.checkExistingBaseline.bind(service),
    listProjections: service.listProjections.bind(service), submit: service.submit.bind(service),
    listFacts: service.listFacts.bind(service), readEvidence: service.readEvidence.bind(service),
    storeEvidence: service.storeEvidence.bind(service), getEvidence: service.getEvidence.bind(service),
    claimEffect: service.claimEffect.bind(service), settleEffect: service.settleEffect.bind(service),
    listEffects: service.listEffects.bind(service), taskGitScope: service.taskGitScope.bind(service), taskWriteScope: service.taskWriteScope.bind(service),
    block: service.block.bind(service),
    acknowledgeDelivery: service.acknowledgeDelivery.bind(service),
    startWorker, stopWorker, reconcile, close, workerStatus: () => status,
  };
}
