import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { link, lstat, mkdir, open, readdir, realpath, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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
  return readBoundedFile(file, maxBytes);
}

async function readBoundedFile(file: string, maxBytes: number): Promise<Buffer> {
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

async function revisionLocation(projectRoot: string, path: string): Promise<{ directory: string; file: string }> {
  const segments = path.split('/');
  const basename = segments.pop()!;
  if (!basename || !segments.length || path.length > 500 || /[\\:\x00-\x1f]/.test(path)
    || [...segments, basename].some(part => !part || part === '.' || part === '..' || /[ .]$/.test(part))) {
    throw new Error('修订文件路径不规范。');
  }
  let directory = await realpath(projectRoot);
  for (const component of segments) {
    directory = join(directory, component);
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || relative(directory, await realpath(directory)) !== '') {
      throw new Error('修订目录存在链接或重定向。');
    }
  }
  return { directory, file: join(directory, basename) };
}

export async function readRevisionProjectFile(projectRoot: string, path: string, maxBytes: number): Promise<Buffer | undefined> {
  const { file } = await revisionLocation(projectRoot, path);
  const stat = await lstat(file).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  if (!stat) return undefined;
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || relative(file, await realpath(file)) !== '') {
    throw new Error('修订文件不是普通文件或存在重定向。');
  }
  const bytes = await readBoundedFile(file, maxBytes);
  const after = await lstat(file);
  if (after.dev !== stat.dev || after.ino !== stat.ino || after.mtimeMs !== stat.mtimeMs || after.size !== stat.size || after.nlink !== 1) {
    throw new Error('修订文件读取期间已变化。');
  }
  return bytes;
}

/** Publish over an exclusive link and identify precisely the temporary inode left after a crash. */
export async function publishRevisionProjectFile(projectRoot: string, path: string, bytes: Buffer, recover: boolean): Promise<void> {
  const { directory, file } = await revisionLocation(projectRoot, path);
  const temporary = join(directory, '.workflow-revision-' + digest(stableJson([path, digest(bytes)])) + '.tmp');
  const statAt = (name: string) => lstat(name).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  });
  const target = await statAt(file);
  const temporaryStat = await statAt(temporary);
  if (target) {
    if (!recover || !target.isFile() || target.isSymbolicLink()) throw new Error('规范后继版本路径已被占用：' + path);
    if (temporaryStat && target.nlink === 2 && temporaryStat.isFile() && !temporaryStat.isSymbolicLink()
      && temporaryStat.dev === target.dev && temporaryStat.ino === target.ino) {
      if (!(await readBoundedFile(temporary, bytes.length)).equals(bytes)) throw new Error('修订暂存和已链接目标已漂移。');
      await unlink(temporary);
    }
    if (!(await readRevisionProjectFile(projectRoot, path, bytes.length))?.equals(bytes)) throw new Error('实际修订目标与批准摘要不一致。');
    return;
  }
  if (temporaryStat) {
    if (!recover || !temporaryStat.isFile() || temporaryStat.isSymbolicLink() || temporaryStat.nlink !== 1
      || !(await readBoundedFile(temporary, bytes.length)).equals(bytes)) throw new Error('待核对的修订暂存无法验证。');
  } else {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally { await handle.close(); }
  }
  try {
    if ((await revisionLocation(projectRoot, path)).directory !== directory) throw new Error('修订目录已变化。');
    await link(temporary, file);
  } finally { await unlink(temporary).catch(() => undefined); }
}

export async function readImportedDefinition(file: string, maxBytes: number): Promise<Buffer> {
  if (!isAbsolute(file) || !/\.ya?ml$/i.test(file) || !(await lstat(file)).isFile()) throw new Error('仅可导入已选中的普通 YAML 文件。');
  return readBoundedFile(await realpath(file), maxBytes);
}

/** Managed path components cannot redirect workflow definitions or shared ownership outside the real root. */
export async function ensureManagedDirectory(root: string, segments: readonly string[]): Promise<string> {
  let directory = root;
  for (const component of segments) {
    directory = join(directory, component);
    await mkdir(directory, { mode: 0o700 }).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    });
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || relative(directory, await realpath(directory)) !== '') {
      throw new Error('应用工作目录存在重定向。');
    }
  }
  return directory;
}

export async function saveDefinitionFile(projectRoot: string, id: string, bytes: Buffer): Promise<string> {
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) throw new Error('无效定义 ID。');
  const root = await realpath(projectRoot);
  const directory = await ensureManagedDirectory(root, ['docs', 'workflows']);
  const temp = join(directory, '.workflow-import-' + randomUUID() + '.tmp');
  const handle = await open(temp, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally { await handle.close(); }
    await link(temp, join(directory, id + '.yaml'));
  } finally { await unlink(temp).catch(() => undefined); }
  return 'docs/workflows/' + id + '.yaml';
}

export async function definitionFiles(projectRoot: string): Promise<string[]> {
  const root = await realpath(projectRoot);
  const directory = await realpath(resolve(root, 'docs/workflows'));
  if (!contains(root, directory)) throw new Error('配置目录不在项目内。');
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map(entry => 'docs/workflows/' + entry.name).sort();
}

export interface RepositoryIdentity {
  projectId: string;
  root: string;
  commonDir: string;
}

export interface WorkspaceIdentity {
  root: string;
  projectId: string;
  repository?: RepositoryIdentity;
}

export async function gitRead(cwd: string, args: string[]): Promise<string> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  const { stdout } = await run('git', args, { cwd, env, timeout: 6000, windowsHide: true, maxBuffer: 1024 * 1024 });
  return stdout.trim();
}

export async function readCandidateBlob(cwd: string, oid: string, path: string, maxBytes: number): Promise<Buffer> {
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(oid) || !path || path.length > 1024
    || /[\\:\x00-\x1f]/.test(path) || path.split('/').some(part => ['', '.', '..'].includes(part))) {
    throw new Error('候选文件需要实际提交和规范项目路径。');
  }
  const entry = await gitRead(cwd, ['ls-tree', '--full-tree', '-z', oid, '--', ':(literal)' + path]);
  const blob = /^100(?:644|755) blob ([0-9a-f]{40,64})\t/.exec(entry)?.[1];
  if (!blob || !entry.endsWith('\0') || entry.slice(entry.indexOf('\t') + 1, -1) !== path) {
    throw new Error('候选树没有该普通文件。');
  }
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  const { stdout } = await run('git', ['cat-file', 'blob', blob], { cwd, env, encoding: 'buffer', maxBuffer: maxBytes, timeout: 6000, windowsHide: true });
  return stdout;
}

export async function repositoryIdentity(projectRoot: string): Promise<RepositoryIdentity> {
  const cwd = await realpath(projectRoot);
  const root = await realpath(await gitRead(cwd, ['rev-parse', '--show-toplevel']));
  if (relative(root, cwd) !== '') throw new Error('须选择 Git 工作区根目录。');
  const commonDir = await realpath(await gitRead(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const identityPath = process.platform === 'win32' ? commonDir.toLowerCase() : commonDir;
  return { projectId: digest(identityPath), root, commonDir };
}

export async function workspaceIdentity(projectRoot: string): Promise<WorkspaceIdentity> {
  if (!isAbsolute(projectRoot)) throw new Error('缺少项目绝对目录。');
  const selected = await lstat(projectRoot);
  if (!selected.isDirectory() || selected.isSymbolicLink()) throw new Error('请选择真实项目目录。');
  const root = await realpath(projectRoot);
  const stat = await lstat(root);
  let repository: RepositoryIdentity | undefined;
  for (let cursor = root;; cursor = dirname(cursor)) {
    const git = await lstat(join(cursor, '.git')).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return undefined;
    });
    if (git) {
      if (cursor !== root) throw new Error('请选择父仓库的工作区根目录。');
      if (git.isSymbolicLink()) throw new Error('Git 元数据存在重定向。');
      repository = await repositoryIdentity(root);
      break;
    }
    if (cursor === dirname(cursor)) break;
  }
  const name = process.platform === 'win32' ? root.toLowerCase() : root;
  return { root, projectId: digest(stableJson([name, stat.dev, stat.ino, stat.birthtimeMs])), repository };
}
