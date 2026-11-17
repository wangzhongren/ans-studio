import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';

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
