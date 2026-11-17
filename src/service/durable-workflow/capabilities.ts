import type {
  DurableCapability, DurableDomainOperation, DurableGraphDefinition, DurableGraphStep, DurableResult,
  DurableRoleSelector, DurableTerminal,
} from '../../model/durable-workflow.ts';
import type { WorkflowStage } from '../../model/runtime.ts';
import { digest, stableJson } from '../../provider/durable-workflow/public.ts';

export type Proof = 'observed' | 'baseline' | 'analysis' | 'usable-analysis' | 'implementation-authorized'
  | 'product-ready' | 'intent-written' | 'intent-approved' | 'plan-ready' | 'proposal-written' | 'proposal-approved'
  | 'personnel-ready' | 'roles-active' | 'team-plan' | 'appointed' | 'standard-open' | 'implementation'
  | 'assessment' | 'archive' | 'published' | 'readonly-closed' | 'stopped';

interface CapabilityDescriptor {
  stage?: WorkflowStage;
  actor: 'chief' | 'convener' | 'host';
  role?: DurableRoleSelector;
  domain?: DurableDomainOperation;
  requires: readonly Proof[];
  outcomes: Readonly<Record<string, readonly Proof[]>>;
  retires?: readonly Proof[];
  writable?: boolean;
  independent?: boolean;
}

const fixed = (actor: CapabilityDescriptor['actor'], needs: readonly Proof[], produces: readonly Proof[], stage?: WorkflowStage) =>
  ({ actor, requires: needs, outcomes: { done: produces }, stage }) satisfies CapabilityDescriptor;
const approval = (domain: DurableDomainOperation, stage: WorkflowStage, needs: readonly Proof[], produces: readonly Proof[]) =>
  ({ stage, actor: 'chief', domain, requires: needs, outcomes: { approved: produces, revise: [], rejected: [] } }) satisfies CapabilityDescriptor;

export const capabilities: Readonly<Record<DurableCapability, CapabilityDescriptor>> = {
  'observe-existing': fixed('chief', [], ['observed'], 'B1'),
  'prepare-existing-branch': { ...fixed('host', ['observed'], ['baseline']), writable: true },
  'b1-impact-readonly': { stage: 'B1', actor: 'convener', role: 'module-owner', requires: ['observed'],
    outcomes: { usable: ['analysis', 'usable-analysis'], needsFollowup: ['analysis'], blocked: ['analysis'] } },
  'b1-open-followup-attempt': { ...fixed('host', ['analysis'], []), retires: ['analysis', 'usable-analysis', 'implementation-authorized'] },
  'finish-readonly': fixed('host', ['observed', 'analysis'], ['readonly-closed']),
  'accept-b3-advance-with-b2-scope': fixed('chief', ['usable-analysis', 'baseline'], ['implementation-authorized']),
  'b3-implement-and-accept': { ...fixed('convener', ['implementation-authorized', 'baseline'], ['implementation'], 'B3'), writable: true },
  'b4-customer-merge-main': { stage: 'B4', actor: 'host', writable: true, requires: ['implementation', 'baseline', 'usable-analysis'],
    outcomes: { merged: ['published'], rejected: ['stopped'] } },
  'readonly-report': { ...fixed('convener', [], ['analysis']), role: 'module-owner' },
  'wait-for-review': { actor: 'convener', requires: ['analysis'], outcomes: { accepted: ['readonly-closed'], blocked: [] } },
  'product-prepare': fixed('convener', [], ['product-ready'], 'A1'),
  'author-intent': { ...fixed('convener', ['product-ready'], ['intent-written'], 'A2'), writable: true, domain: 'close-task' },
  'confirm-intent': { ...approval('intent-card', 'A3', ['intent-written'], ['intent-approved']), writable: true },
  'planning-prepare': fixed('convener', ['intent-approved'], ['plan-ready'], 'A4'),
  'author-proposal': { ...fixed('convener', ['plan-ready', 'intent-approved'], ['proposal-written'], 'A5'), writable: true, domain: 'close-task' },
  'confirm-proposal': approval('proposal-card', 'A6', ['proposal-written', 'intent-approved'], ['proposal-approved']),
  'personnel-prepare': fixed('convener', ['proposal-approved'], ['personnel-ready'], 'A7'),
  'activate-roles': { ...fixed('convener', ['personnel-ready', 'proposal-approved'], ['roles-active'], 'A8'), writable: true, domain: 'activate-roles' },
  'team-baseline': { ...fixed('convener', ['roles-active', 'proposal-approved'], ['baseline', 'team-plan'], 'A9'), writable: true, domain: 'team-baseline' },
  'confirm-appointment': approval('appointment-card', 'A10', ['team-plan', 'roles-active', 'baseline'], ['appointed', 'implementation-authorized']),
  'independent-standard': { ...fixed('chief', ['baseline', 'implementation-authorized'], ['standard-open'], 'A12a'),
    writable: true, independent: true, role: 'independent-reviewer', domain: 'close-task' },
  'governed-implementation': { ...fixed('convener', ['appointed', 'team-plan', 'baseline', 'standard-open'], ['implementation'], 'A11'),
    writable: true, role: 'module-owner', domain: 'close-task' },
  'independent-assessment': { stage: 'A12b', actor: 'chief', role: 'independent-reviewer', domain: 'close-task', writable: true,
    independent: true, requires: ['baseline', 'standard-open', 'implementation'], outcomes: { accepted: ['assessment'], rework: [], blocked: [] } },
  'archive-acceptance': { ...fixed('host', ['standard-open', 'assessment', 'implementation'], ['archive'], 'A12b'),
    writable: true, domain: 'archive-acceptance' },
  'customer-publish': { stage: 'A13', actor: 'host', writable: true, requires: ['implementation', 'baseline', 'archive'],
    outcomes: { merged: ['published'], rejected: ['stopped'] } },
  'verify-stop': fixed('convener', [], ['stopped']),
  'retry-intent': { ...fixed('host', ['product-ready'], []), retires: ['intent-written', 'intent-approved', 'proposal-written', 'proposal-approved'] },
  'retry-proposal': { ...fixed('host', ['plan-ready', 'intent-approved'], []), retires: ['proposal-written', 'proposal-approved', 'personnel-ready', 'roles-active', 'team-plan', 'appointed', 'implementation-authorized'] },
  'retry-implementation': { ...fixed('host', ['standard-open', 'implementation-authorized'], []), retires: ['implementation', 'assessment', 'archive'] },
};

const idPattern = /^[a-z][a-z0-9-]{0,63}$/;
const terminals = new Set<DurableTerminal>(['blocked', 'stopped', 'delivered', 'completed']);
const boundedActions: Partial<Record<DurableCapability, DurableCapability>> = {
  'b1-open-followup-attempt': 'b1-impact-readonly',
  'retry-intent': 'author-intent',
  'retry-proposal': 'author-proposal',
  'retry-implementation': 'governed-implementation',
};
const legacySingletonActions = new Set<DurableCapability>([
  'prepare-existing-branch', 'b1-impact-readonly', 'b1-open-followup-attempt', 'accept-b3-advance-with-b2-scope',
  'b3-implement-and-accept', 'b4-customer-merge-main', 'readonly-report', 'wait-for-review', 'customer-publish',
]);
const invalid = (message: string, path: string): DurableResult<never> => ({ ok: false, code: 'definition-invalid', message, path });
const mapping = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && idPattern.test(value);
const unknownKey = (obj: object, allowed: readonly string[]) => Object.keys(obj).find(key => !allowed.includes(key));

export function parseGraphDefinition(input: Record<string, unknown>): DurableResult<DurableGraphDefinition> {
  const extra = unknownKey(input, ['schema', 'id', 'version', 'name', 'start', 'steps']);
  if (extra !== undefined) return invalid('未知配置字段。', extra);
  if (!identifier(input.id)) return invalid('id 须为小写标识。', 'id');
  if (!Number.isSafeInteger(input.version) || Number(input.version) < 1) return invalid('version 须为正整数。', 'version');
  if (input.name !== undefined && (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120)) return invalid('name 须是 1–120 字名称。', 'name');
  if (!identifier(input.start)) return invalid('start 须为步骤标识。', 'start');
  if (!mapping(input.steps) || !Object.keys(input.steps).length || Object.keys(input.steps).length > 32) return invalid('steps 须含 1–32 个步骤。', 'steps');

  const steps: Record<string, DurableGraphStep> = Object.create(null);
  const singletonActions = new Set<DurableCapability>();
  for (const [key, value] of Object.entries(input.steps)) {
    const path = 'steps.' + key;
    if (!identifier(key) || !mapping(value)) return invalid('无效步骤或步骤标识。', path);
    if (Object.hasOwn(value, 'terminal')) {
      if (!terminals.has(value.terminal as DurableTerminal) || Object.keys(value).length !== 1) return invalid('终态无效。', path);
      steps[key] = { terminal: value.terminal as DurableTerminal };
      continue;
    }
    if (typeof value.action !== 'string' || !Object.hasOwn(capabilities, value.action)) return invalid('未知注册能力。', path + '.action');
    const action = value.action as DurableCapability;
    if (legacySingletonActions.has(action)) {
      if (singletonActions.has(action)) return invalid('单一业务记录的能力只能配置一个节点。', path + '.action');
      singletonActions.add(action);
    }
    const descriptor = capabilities[action];
    const bounded = boundedActions[action] !== undefined;
    const resultNames = Object.keys(descriptor.outcomes);
    const branching = resultNames.length > 1;
    const extraStep = unknownKey(value, ['action', ...(descriptor.role ? ['role'] : []), branching ? 'on' : 'next',
      ...(bounded ? ['maxVisits', 'onLimit'] : [])]);
    if (extraStep !== undefined) return invalid('能力不支持此字段。', path + '.' + extraStep);
    if (descriptor.role !== value.role) return invalid('角色选择器不符合该能力。', path + '.role');
    const step: Exclude<DurableGraphStep, { terminal: DurableTerminal }> = { action };
    if (descriptor.role) step.role = descriptor.role;
    if (branching) {
      if (!mapping(value.on) || Object.keys(value.on).length !== resultNames.length) return invalid('分支须完整。', path + '.on');
      const on: Record<string, string> = Object.create(null);
      for (const result of resultNames) {
        if (!identifier(value.on[result])) return invalid('分支目标缺失或无效。', path + '.on.' + result);
        on[result] = value.on[result];
      }
      step.on = on;
    } else if (identifier(value.next)) step.next = value.next;
    else return invalid('能力需要 next 步骤。', path + '.next');
    if (bounded) {
      if (!Number.isSafeInteger(value.maxVisits) || Number(value.maxVisits) < 1 || Number(value.maxVisits) > 3 || !identifier(value.onLimit))
        return invalid('返工需要 1–3 次额度及安全出口。', path);
      step.maxVisits = Number(value.maxVisits);
      step.onLimit = value.onLimit;
    }
    steps[key] = step;
  }

  const initial = steps[input.start];
  if (!initial || 'terminal' in initial || !['product-prepare', 'observe-existing', 'readonly-report'].includes(initial.action)) {
    return invalid('首步须为受信准备或只读观察。', 'start');
  }
  const error = proveGraph(steps, input.start);
  if (error) return error;
  const graph = { schema: 2 as const, id: input.id, version: Number(input.version), name: String(input.name ?? input.id), start: input.start, steps };
  return { ok: true, value: { ...graph, digest: digest(stableJson(graph)) } };
}

interface ProofState { guaranteed: Set<Proof>; independent: boolean; writable: boolean }

function proveGraph(steps: Record<string, DurableGraphStep>, start: string): DurableResult<never> | undefined {
  const between = new Map<string, string[]>();
  for (const [key, step] of Object.entries(steps)) {
    if ('terminal' in step) continue;
    const next = step.on ? Object.values(step.on) : [step.next!];
    if (step.onLimit) {
      const expected = steps[step.next!];
      const limit = steps[step.onLimit];
      if (!expected || !('action' in expected) || expected.action !== boundedActions[step.action]
        || !limit || !('terminal' in limit) || !['blocked', 'stopped'].includes(limit.terminal)) {
        return invalid('返工目标或额度出口违反能力约束。', 'steps.' + key);
      }
      next.push(step.onLimit);
    }
    if (next.some(target => !Object.hasOwn(steps, target))) return invalid('目标步骤不存在。', 'steps.' + key);
    between.set(key, step.onLimit ? [step.onLimit] : next);
  }
  const busy = new Set<string>(), checked = new Set<string>();
  const cycle = (name: string): boolean => {
    if (busy.has(name)) return true;
    if (checked.has(name)) return false;
    busy.add(name);
    if ((between.get(name) ?? []).some(cycle)) return true;
    busy.delete(name);
    checked.add(name);
    return false;
  };
  if (Object.keys(steps).some(cycle)) return invalid('检测到未经持久额度限制的工作流循环。', 'steps');

  const state = new Map<string, ProofState>([[start, { guaranteed: new Set(), independent: false, writable: false }]]);
  const queue = [start];
  while (queue.length) {
    const name = queue.shift()!;
    const before = state.get(name)!;
    const step = steps[name]!;
    const at = 'steps.' + name;
    if ('terminal' in step) {
      if (step.terminal === 'delivered' && !before.guaranteed.has('published')
        || step.terminal === 'completed' && (!before.guaranteed.has('readonly-closed') || before.writable)
        || step.terminal === 'stopped' && !before.guaranteed.has('stopped') && before.writable) {
        return invalid('终点缺少所有进入路径均能证明的发布、只读或停稳依据。', at);
      }
      continue;
    }
    const descriptor = capabilities[step.action];
    const missing = descriptor.requires.find(fact => !before.guaranteed.has(fact));
    if (missing) return invalid('无法证明能力前置事实 ' + missing, at + '.action');
    if ((step.action === 'finish-readonly' && before.writable)
      || (step.action === 'b4-customer-merge-main' && before.independent)) {
      return invalid('路线违反只读或独立归档前置条件。', at + '.action');
    }
    const edges = step.on ? Object.entries(step.on) : [['done', step.next!]];
    if (step.onLimit) edges.push(['limit', step.onLimit]);
    for (const [result, target] of edges) {
      const after = new Set(before.guaranteed);
      if (result === 'limit') after.add('stopped');
      else {
        for (const item of descriptor.retires ?? []) after.delete(item);
        for (const item of descriptor.outcomes[result!] ?? []) after.add(item);
      }
      const previous = state.get(target!);
      const merged = previous ? new Set([...previous.guaranteed].filter(value => after.has(value))) : after;
      const independent = before.independent || descriptor.independent === true || previous?.independent === true;
      const writable = before.writable || descriptor.writable === true || previous?.writable === true;
      if (!previous || merged.size !== previous.guaranteed.size || independent !== previous.independent || writable !== previous.writable) {
        state.set(target!, { guaranteed: merged, independent, writable });
        queue.push(target!);
      }
    }
  }
  if (state.size !== Object.keys(steps).length) return invalid('步骤从 start 不可达。', 'steps.' + Object.keys(steps).find(key => !state.has(key)));
  return undefined;
}

export function graphNeedsWrite(definition: DurableGraphDefinition): boolean {
  return Object.values(definition.steps).some(step => 'action' in step && capabilities[step.action].writable === true);
}
