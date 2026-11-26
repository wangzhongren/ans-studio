import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';

export async function pathAV8Source(): Promise<string> {
  const source = await readFile(new URL('../../../docs/workflows/path-a.yaml', import.meta.url), 'utf8');
  return source.replace(/^version: 9$/m, 'version: 8').replace(/^evidenceAudit:\r?\n  version: 1\r?\n  collectorRoleId: acceptance-evidence-collector\r?\n/m, '');
}

export async function pathAV7Source(): Promise<string> {
  const source = await pathAV8Source();
  return source.replace(/^version: 8$/m, 'version: 7').replace(/^    blockedRouting: true\r?\n/gm, '');
}

export async function pinPathAV8(definitions: string): Promise<void> {
  await writeFile(join(definitions, 'path-a.yaml'), await pathAV8Source());
}

export async function pinPathAV7(definitions: string): Promise<void> {
  await writeFile(join(definitions, 'path-a.yaml'), await pathAV7Source());
}

export const legacyPathA = `schema: 2
id: path-a
version: 1
name: 路径 A
start: prepare-product
steps:
  prepare-product:
    action: product-prepare
    next: write-intent
  write-intent:
    action: author-intent
    next: confirm-intent
  confirm-intent:
    action: confirm-intent
    on: { approved: prepare-planning, revise: revise-intent, rejected: verify-stop }
  revise-intent:
    action: retry-intent
    maxVisits: 2
    next: write-intent
    onLimit: stopped
  prepare-planning:
    action: planning-prepare
    next: write-proposal
  write-proposal:
    action: author-proposal
    next: confirm-proposal
  confirm-proposal:
    action: confirm-proposal
    on: { approved: prepare-personnel, revise: revise-proposal, rejected: blocked }
  revise-proposal:
    action: retry-proposal
    maxVisits: 2
    next: write-proposal
    onLimit: stopped
  prepare-personnel:
    action: personnel-prepare
    next: activate-roles
  activate-roles:
    action: activate-roles
    next: establish-team-baseline
  establish-team-baseline:
    action: team-baseline
    next: confirm-appointment
  confirm-appointment:
    action: confirm-appointment
    on: { approved: open-standard, revise: blocked, rejected: blocked }
  open-standard:
    action: independent-standard
    role: independent-reviewer
    next: implement
  implement:
    action: governed-implementation
    role: module-owner
    next: assess
  assess:
    action: independent-assessment
    role: independent-reviewer
    on: { accepted: archive, rework: revise-implementation, blocked: blocked }
  revise-implementation:
    action: retry-implementation
    maxVisits: 2
    next: implement
    onLimit: blocked
  archive:
    action: archive-acceptance
    next: publish
  publish:
    action: customer-publish
    on: { merged: delivered, rejected: stopped }
  verify-stop:
    action: verify-stop
    next: stopped
  delivered: { terminal: delivered }
  stopped: { terminal: stopped }
  blocked: { terminal: blocked }
`;

export const legacyPathADirectA1 = `schema: 2
id: path-a
version: 2
name: 路径 A
start: prepare-product
steps:
  prepare-product:
    action: product-prepare-direct
    role: product
    on: { ready: write-intent, blocked: blocked }
  write-intent:
    action: author-intent
    next: confirm-intent
  confirm-intent:
    action: confirm-intent
    on: { approved: prepare-planning, revise: revise-intent, rejected: verify-stop }
  revise-intent:
    action: retry-intent
    maxVisits: 2
    next: write-intent
    onLimit: stopped
  prepare-planning:
    action: planning-prepare
    next: write-proposal
  write-proposal:
    action: author-proposal
    next: confirm-proposal
  confirm-proposal:
    action: confirm-proposal
    on: { approved: prepare-personnel, revise: revise-proposal, rejected: blocked }
  revise-proposal:
    action: retry-proposal
    maxVisits: 2
    next: write-proposal
    onLimit: stopped
  prepare-personnel:
    action: personnel-prepare
    next: activate-roles
  activate-roles:
    action: activate-roles
    next: establish-team-baseline
  establish-team-baseline:
    action: team-baseline
    next: confirm-appointment
  confirm-appointment:
    action: confirm-appointment
    on: { approved: open-standard, revise: blocked, rejected: blocked }
  open-standard:
    action: independent-standard
    role: independent-reviewer
    next: implement
  implement:
    action: governed-implementation
    role: module-owner
    next: assess
  assess:
    action: independent-assessment
    role: independent-reviewer
    on: { accepted: archive, rework: revise-implementation, blocked: blocked }
  revise-implementation:
    action: retry-implementation
    maxVisits: 2
    next: implement
    onLimit: blocked
  archive:
    action: archive-acceptance
    next: publish
  publish:
    action: customer-publish
    on: { merged: delivered, rejected: stopped }
  verify-stop:
    action: verify-stop
    next: stopped
  delivered: { terminal: delivered }
  stopped: { terminal: stopped }
  blocked: { terminal: blocked }
`;

export const legacyPathAWorkflowOwned = `schema: 2
id: path-a
version: 4
name: 路径 A
start: prepare-product
steps:
  prepare-product:
    action: product-prepare-direct
    role: product
    on: { ready: write-intent, blocked: blocked }
  write-intent:
    action: author-intent-direct
    role: product
    on: { ready: confirm-intent, clarify: needs-clarification, blocked: blocked }
  confirm-intent:
    action: confirm-intent
    on: { approved: prepare-planning, revise: revise-intent, rejected: verify-stop }
  revise-intent:
    action: retry-intent
    maxVisits: 2
    next: write-intent
    onLimit: stopped
  prepare-planning:
    action: planning-prepare
    role: rapporteur
    next: write-proposal
    onFailure: blocked
  write-proposal:
    action: author-proposal
    role: rapporteur
    next: confirm-proposal
    onFailure: blocked
  confirm-proposal:
    action: confirm-proposal
    on: { approved: prepare-personnel, revise: revise-proposal, rejected: blocked }
  revise-proposal:
    action: retry-proposal
    maxVisits: 2
    next: write-proposal
    onLimit: stopped
  prepare-personnel:
    action: personnel-prepare
    role: nominator
    next: activate-roles
    onFailure: blocked
  activate-roles:
    action: activate-roles
    role: nominator
    next: establish-team-baseline
    onFailure: blocked
  establish-team-baseline:
    action: team-baseline
    role: convener
    next: confirm-appointment
    onFailure: blocked
  confirm-appointment:
    action: confirm-appointment
    on: { approved: open-standard, revise: blocked, rejected: blocked }
  open-standard:
    action: independent-standard
    role: independent-reviewer
    next: implement
    onFailure: blocked
  implement:
    action: governed-implementation
    role: module-owner
    next: assess
    onFailure: blocked
  assess:
    action: independent-assessment
    role: independent-reviewer
    on: { accepted: archive, rework: revise-implementation, blocked: blocked }
  revise-implementation:
    action: retry-implementation
    maxVisits: 2
    next: implement
    onLimit: blocked
  archive:
    action: archive-acceptance
    next: publish
  publish:
    action: customer-publish
    on: { merged: delivered, rejected: stopped }
  verify-stop:
    action: verify-stop
    next: stopped
  delivered: { terminal: delivered }
  stopped: { terminal: stopped }
  blocked: { terminal: blocked }
  needs-clarification: { terminal: blocked }
`;

export const legacyPathB = `schema: 1
id: path-b
version: 1
name: 路径 B
start: impact
steps:
  impact:
    action: b1-impact-readonly
    role: module-owner
    on:
      usable: scope
      needsFollowup: blocked
      blocked: blocked
  scope:
    action: accept-b3-advance-with-b2-scope
    next: implement
  implement:
    action: b3-implement-and-accept
    next: release
  release:
    action: b4-customer-merge-main
    on:
      merged: delivered
      rejected: stopped
  blocked: { terminal: blocked }
  stopped: { terminal: stopped }
  delivered: { terminal: delivered }
`;

export function git(projectRoot: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: projectRoot, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

export async function fixture(t: TestContext, parent = tmpdir()) {
  await mkdir(parent, { recursive: true });
  const temp = await realpath(parent);
  const prefix = join(temp, 'ans-durable-w1-');
  const directory = await mkdtemp(prefix);
  const cleanup: (() => void)[] = [];
  t.after(async () => {
    for (const close of cleanup) close();
    if (process.env.ANS_DURABLE_KEEP_FIXTURE === '1') return;
    const target = await realpath(directory);
    if (target.startsWith(prefix) && target.length > prefix.length) await rm(target, { recursive: true, force: true, maxRetries: 2 });
  });
  const project = join(directory, 'project');
  const definitions = join(project, 'docs', 'workflows');
  await mkdir(definitions, { recursive: true });
  await Promise.all([
    writeFile(join(definitions, 'path-b.yaml'), legacyPathB, 'utf8'),
    copyFile(new URL('../../../docs/workflows/read-only-example.yaml', import.meta.url), join(definitions, 'read-only-example.yaml')),
  ]);
  git(project, 'init', '-b', 'main');
  git(project, 'add', '.');
  git(project, '-c', 'user.name=ANS test', '-c', 'user.email=ans-test@example.invalid', 'commit', '-m', 'Fixture');
  return { directory, project, definitions, dataDir: join(directory, 'ans-data'), hostDir: join(directory, 'host-data'), cleanup };
}
