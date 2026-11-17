import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  });
}

export function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function contains(root: string, candidate: string): boolean {
  const tail = relative(root, candidate);
  return tail !== '' && tail !== '..' && !tail.startsWith('..' + sep) && !isAbsolute(tail);
}

export async function readProjectFile(projectRoot: string, path: string, maxBytes: number): Promise<Buffer> {
  if (isAbsolute(path) || path.includes(':') || path.startsWith('/') || /(^|[\\/])\.\.([\\/]|$)/.test(path)) {
    throw new Error('文件路径须位于项目内。');
  }
  const root = await realpath(projectRoot);
  const file = await realpath(resolve(root, path));
  if (!contains(root, file)) throw new Error('文件不在项目内。');
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('文件类型或大小超限。');
    const buffer = Buffer.alloc(maxBytes + 1);
    const bytesRead = (await handle.read(buffer, 0, buffer.length, 0)).bytesRead;
    if (bytesRead > maxBytes) throw new Error('文件大小超限。');
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function definitionFiles(projectRoot: string): Promise<string[]> {
  const root = await realpath(projectRoot);
  const directory = await realpath(resolve(root, 'docs/workflows'));
  if (!contains(root, directory)) throw new Error('配置目录不在项目内。');
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.endsWith('.yaml'))
    .map(entry => 'docs/workflows/' + entry.name).sort();
}

export interface RepositoryIdentity {
  projectId: string;
  root: string;
  commonDir: string;
}

export async function gitRead(cwd: string, args: string[]): Promise<string> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  const { stdout } = await run('git', args, { cwd, env, timeout: 6000, windowsHide: true, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

export async function repositoryIdentity(projectRoot: string): Promise<RepositoryIdentity> {
  const cwd = await realpath(projectRoot);
  const root = await realpath(await gitRead(cwd, ['rev-parse', '--show-toplevel']));
  if (relative(root, cwd) !== '') throw new Error('须选择 Git 工作区根目录。');
  const commonDir = await realpath(await gitRead(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const identityPath = process.platform === 'win32' ? commonDir.toLowerCase() : commonDir;
  return { projectId: digest(identityPath), root, commonDir };
}
