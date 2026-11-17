import { parseDocument, visit } from 'yaml';
import type { DurableAction, DurableDefinition, DurableResult, DurableStep, DurableTerminal } from '../../model/durable-workflow.ts';
import { digest, stableJson } from '../../provider/durable-workflow/public.ts';

const idPattern = /^[a-z][a-z0-9-]{0,63}$/;
const terminals = new Set<DurableTerminal>(['blocked', 'stopped', 'delivered', 'completed']);
const branches = {
  'b1-impact-readonly': { usable: ['accept-b3-advance-with-b2-scope'], needsFollowup: ['b1-open-followup-attempt', 'blocked'], blocked: ['blocked'] },
  'b4-customer-merge-main': { merged: ['delivered'], rejected: ['stopped'] },
  'wait-for-review': { accepted: ['completed'], blocked: ['blocked'] },
} as const;
const linear = {
  'accept-b3-advance-with-b2-scope': ['b3-implement-and-accept'],
  'b3-implement-and-accept': ['b4-customer-merge-main'],
  'readonly-report': ['wait-for-review'],
  'b1-open-followup-attempt': ['b1-impact-readonly'],
} as const;
const allActions = new Set([...Object.keys(branches), ...Object.keys(linear)]);
const own = (object: object, key: string): boolean => Object.hasOwn(object, key);
const mapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && idPattern.test(value);
const invalid = (message: string, path: string): DurableResult<never> => ({ ok: false, code: 'definition-invalid', message, path });

function shape(object: Record<string, unknown>, allowed: readonly string[]): string | undefined {
  return Object.keys(object).find(key => !allowed.includes(key));
}

export function parseDefinition(text: string): DurableResult<DurableDefinition> {
  const doc = parseDocument(text, { version: '1.2', strict: true, uniqueKeys: true, merge: false });
  if (doc.errors.length || doc.warnings.length) {
    return invalid((doc.errors[0] ?? doc.warnings[0])!.message, '$');
  }
  if (doc.directives?.yaml.explicit && doc.directives.yaml.version !== '1.2') {
    return invalid('工作流配置要求 YAML 1.2。', '$');
  }
  let unsafe = false;
  visit(doc, (_, node) => {
    if (node && typeof node === 'object' && ('source' in node && node.constructor.name === 'Alias' || 'tag' in node && node.tag || 'anchor' in node && node.anchor)) {
      unsafe = true;
      return visit.BREAK;
    }
  });
  if (unsafe) return invalid('配置不接受 YAML 锚点、别名或标签。', '$');

  const input: unknown = doc.toJS({ maxAliasCount: 0 });
  if (!mapping(input)) return invalid('配置须是单个 YAML 映射。', '$');
  const unknown = shape(input, ['schema', 'id', 'version', 'name', 'start', 'steps']);
  if (unknown !== undefined) return invalid('未知配置字段。', unknown);
  if (input.schema !== 1) return invalid('schema 必须为 1。', 'schema');
  if (!identifier(input.id)) return invalid('id 须为小写标识。', 'id');
  if (!Number.isSafeInteger(input.version) || Number(input.version) < 1) return invalid('version 须为正整数。', 'version');
  if (input.name !== undefined && (typeof input.name !== 'string' || input.name.trim().length === 0 || input.name.length > 120)) {
    return invalid('name 须是 1–120 字名称。', 'name');
  }
  if (!identifier(input.start)) return invalid('start 须为步骤标识。', 'start');
  if (!mapping(input.steps) || Object.keys(input.steps).length === 0 || Object.keys(input.steps).length > 32) {
    return invalid('steps 须含 1–32 个步骤。', 'steps');
  }
  const steps: Record<string, DurableStep> = Object.create(null);
  for (const [key, value] of Object.entries(input.steps)) {
    const path = 'steps.' + key;
    if (!identifier(key) || !mapping(value)) return invalid('无效步骤或步骤标识。', path);
    if (own(value, 'terminal')) {
      if (shape(value, ['terminal']) !== undefined || !terminals.has(value.terminal as DurableTerminal)) {
        return invalid('终点必须是已知终态且不可声明其他字段。', path);
      }
      steps[key] = { terminal: value.terminal as DurableTerminal };
      continue;
    }
    if (typeof value.action !== 'string' || !allActions.has(value.action)) return invalid('未知内置活动。', path + '.action');
    const action = value.action as DurableAction;
    const hasRole = action === 'readonly-report' || action === 'b1-impact-readonly';
    const isFollowup = action === 'b1-open-followup-attempt';
    const isBranch = own(branches, action);
    const allowed = ['action', isBranch ? 'on' : 'next', ...(hasRole ? ['role'] : []), ...(isFollowup ? ['maxVisits', 'onLimit'] : [])];
    const unknownStep = shape(value, allowed);
    if (unknownStep !== undefined) return invalid('当前活动不接受该字段。', path + '.' + unknownStep);
    if (hasRole && value.role !== 'module-owner') return invalid('只读活动须绑定现有模块属主。', path + '.role');
    const step: Exclude<DurableStep, { terminal: DurableTerminal }> = { action };
    if (hasRole) step.role = 'module-owner';
    if (isBranch) {
      const expected = branches[action as keyof typeof branches];
      if (!mapping(value.on) || Object.keys(value.on).length !== Object.keys(expected).length) return invalid('分支须准确覆盖活动结果。', path + '.on');
      const on: Record<string, string> = Object.create(null);
      for (const outcome of Object.keys(expected)) {
        const target = value.on[outcome];
        if (!identifier(target)) return invalid('缺少有效分支步骤。', path + '.on.' + outcome);
        on[outcome] = target;
      }
      step.on = on;
    } else {
      if (!identifier(value.next)) return invalid('活动需要 next 步骤。', path + '.next');
      step.next = value.next;
    }
    if (isFollowup) {
      if (!Number.isSafeInteger(value.maxVisits) || Number(value.maxVisits) < 1 || Number(value.maxVisits) > 3 || !identifier(value.onLimit)) {
        return invalid('补查需要 1–3 次额度和终止出口。', path);
      }
      step.maxVisits = Number(value.maxVisits);
      step.onLimit = value.onLimit;
    }
    steps[key] = step;
  }
  const start = steps[input.start];
  if (start === undefined || 'terminal' in start || !['b1-impact-readonly', 'readonly-report'].includes(start.action)) {
    return invalid('首步须为内置只读报告活动。', 'start');
  }
  if ((input.id === 'path-b') !== (start.action === 'b1-impact-readonly')) {
    return invalid('路径 B 和只读定义具有不同的首步。', 'start');
  }
  const reached = new Set<string>();
  const queue = [input.start];
  while (queue.length > 0) {
    const key = queue.shift()!;
    if (reached.has(key)) continue;
    reached.add(key);
    const step = steps[key]!;
    if ('terminal' in step) continue;
    const expected = own(branches, step.action) ? branches[step.action as keyof typeof branches] as Record<string, readonly string[]> : undefined;
    const edges = step.on !== undefined
      ? Object.entries(step.on).map(([outcome, target]) => [outcome, target, expected![outcome]] as const)
      : [['next', step.next!, linear[step.action as keyof typeof linear]] as const];
    if (step.onLimit !== undefined) edges.push(['onLimit', step.onLimit, ['blocked']]);
    for (const [edge, target, allowed] of edges) {
      const targetStep = steps[target];
      const capability = targetStep && ('terminal' in targetStep ? targetStep.terminal : targetStep.action);
      if (!capability || !(allowed as readonly string[]).includes(capability)) {
        return invalid('步骤跳转与内置前置条件冲突。', 'steps.' + key + '.' + edge);
      }
      if (step.action === 'b1-open-followup-attempt' && edge === 'next' && target !== input.start) {
        return invalid('补查须返回同一个 B1 影响面步骤。', 'steps.' + key + '.next');
      }
      queue.push(target);
    }
  }
  if (reached.size !== Object.keys(steps).length) {
    return invalid('步骤从 start 不可达。', 'steps.' + Object.keys(steps).find(key => !reached.has(key)));
  }
  const graph = { schema: 1 as const, id: input.id, version: Number(input.version), name: String(input.name ?? input.id), start: input.start, steps };
  return { ok: true, value: { ...graph, digest: digest(stableJson(graph)) } };
}
