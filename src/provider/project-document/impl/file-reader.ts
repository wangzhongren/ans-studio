import fs from 'node:fs/promises';
import { constants, type Stats } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DocumentFileError, type ProjectDocumentFileReader, type ProjectDocumentFileReaderOptions } from '../abstract/file-reader.ts';
import { isAbsoluteAny, normalizeLexical } from '../../../common/shared/path-primitives.ts';

const fail = (code: ConstructorParameters<typeof DocumentFileError>[0]): never => { throw new DocumentFileError(code); };
const identity = (a: {dev:number;ino:number}, b: {dev:number;ino:number}) => a.dev === b.dev && a.ino === b.ino;
const unchanged = (a: {dev:number;ino:number;size:number;mtimeMs:number;ctimeMs:number}, b: typeof a) => identity(a,b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const localTypes = new Set([26, 23, 17, 0xef53, 0x1021994, 0x794c7630, 0x9123683e, 0x58465342]); // APFS/HFS/tmpfs and tested local Linux families
function relativeSegments(rel: string): string[] {
  if (!rel || rel.includes('\0') || isAbsoluteAny(rel) || rel.includes('\\') || rel.includes(':') || normalizeLexical(rel) !== rel || rel.split('/').some(s => !s || s === '.' || s === '..')) fail('OUTSIDE_PROJECT');
  return rel.split('/');
}
function within(root: string, file: string): boolean { const r = path.relative(root,file); return r !== '' && !r.startsWith('..'+path.sep) && r !== '..' && !path.isAbsolute(r); }
function mapError(error: unknown): never {
  if (error instanceof DocumentFileError) throw error;
  const code = (error as NodeJS.ErrnoException)?.code;
  return fail(code === 'ENOENT' ? 'NOT_FOUND' : code === 'EACCES' || code === 'EPERM' ? 'PERMISSION_DENIED' : code === 'ELOOP' ? 'SYMLINK_NOT_ALLOWED' : 'IO_ERROR');
}
export function buildProjectDocumentFileReader(options: ProjectDocumentFileReaderOptions = {}): ProjectDocumentFileReader {
  const platform = options.platform ?? process.platform;
  const roots = new Map<string,{dev:number;ino:number}>();
  async function supported(root: string): Promise<void> {
    if (!['darwin','linux'].includes(platform) || !constants.O_NOFOLLOW) fail('UNSUPPORTED_ENVIRONMENT');
    const stat = await fs.statfs(root);
    if (!localTypes.has(stat.type)) fail('UNSUPPORTED_ENVIRONMENT');
  }
  async function inspect(root: string, rel: string) {
    const segments = relativeSegments(rel);
    if (await fs.realpath(root) !== root) fail('CHANGED_DURING_READ');
    const rootStat=await fs.lstat(root);
    if(rootStat.isSymbolicLink() || !rootStat.isDirectory() || !roots.has(root) || !identity(roots.get(root)!,rootStat)) fail('CHANGED_DURING_READ');
    const ancestors: {file:string;stat:Stats}[] = [{file:root,stat:rootStat}];
    let file = root;
    for (const segment of segments) {
      file = path.join(file, segment);
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) fail('SYMLINK_NOT_ALLOWED');
      ancestors.push({file,stat});
    }
    if (!within(root, await fs.realpath(file))) fail('OUTSIDE_PROJECT');
    const stat = ancestors.at(-1)!.stat;
    if (!stat.isFile()) fail('NOT_FILE');
    if (!stat.ino || !Number.isSafeInteger(stat.ino) || !Number.isSafeInteger(stat.dev)) fail('UNSUPPORTED_ENVIRONMENT');
    return { file, stat, ancestors };
  }
  return {
    newId: () => randomUUID(),
    async resolveRoot(root) {
      try { const real = await fs.realpath(root); if (!(await fs.stat(real)).isDirectory()) fail('NOT_FILE'); await supported(real); const stat=await fs.stat(real); if(!stat.ino || !Number.isSafeInteger(stat.ino) || !Number.isSafeInteger(stat.dev)) fail('UNSUPPORTED_ENVIRONMENT'); roots.set(real,{dev:stat.dev,ino:stat.ino}); return real; } catch(e) { return mapError(e); }
    },
    async read(root, rel, limit) {
      let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
      try {
        await supported(root);
        const before = await inspect(root,rel);
        await supported(before.file);
        if (before.stat.size > limit) fail('TOO_LARGE');
        await options.checkpoint?.('checked',before.file);
        handle = await fs.open(before.file,constants.O_RDONLY | constants.O_NOFOLLOW);
        const opened = await handle.stat();
        if (!opened.isFile()) fail('NOT_FILE');
        if (!unchanged(before.stat,opened)) fail('CHANGED_DURING_READ');
        await options.checkpoint?.('opened',before.file);
        const bytes = new Uint8Array(limit+1);
        let used = 0;
        while (used < bytes.length) {
          const { bytesRead } = await handle.read(bytes,used,bytes.length-used,used);
          if (!bytesRead) break;
          used += bytesRead;
        }
        if (used > limit) fail('TOO_LARGE');
        await options.checkpoint?.('read',before.file);
        const after = await handle.stat();
        const current = await inspect(root,rel);
        if (!unchanged(opened,after) || !identity(after,current.stat) || !unchanged(after,current.stat)
          || before.ancestors.some((a,i) => !identity(a.stat,current.ancestors[i]!.stat))) fail('CHANGED_DURING_READ');
        return bytes.slice(0,used);
      } catch(e) { return mapError(e); }
      finally { await handle?.close(); }
    },
  };
}
