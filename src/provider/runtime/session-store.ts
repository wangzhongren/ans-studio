// Public ANS session index and readable replay. Owner: 运行时核心.
import { appendFile, mkdir, readFile, lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateReportSnapshot, canonicalJson } from "../../common/runtime-core/report-provenance.ts";
import { atomicWrite } from "../../common/shared/atomic-write.ts";
import { RUNTIME_KINDS } from "../../common/shared/runtime-shared.ts";
import type { RuntimeKind, RuntimeReplayEntry, RuntimeSessionRecord, RuntimeSessionStorage, RuntimeReportSnapshotV1 } from "../../model/runtime.ts";

export interface RuntimeSessionStoreOptions { projectRoot: string; roleId: string; runtime: RuntimeKind }

function validateScope(options: RuntimeSessionStoreOptions): void {
  if (!path.isAbsolute(options.projectRoot)) throw new Error("会话 projectRoot 必须为绝对路径");
  if (!options.roleId || options.roleId === "." || options.roleId === ".." || /[\\/\u0000]/.test(options.roleId)) {
    throw new Error("会话 roleId 必须为单个非空目录名");
  }
  if (!(RUNTIME_KINDS as readonly string[]).includes(options.runtime)) throw new Error(`未知运行时：${options.runtime}`);
}

/** Pure directory calculation; construction and reads never create .ans. */
export function runtimeSessionDirectory(options: RuntimeSessionStoreOptions): string {
  validateScope(options);
  return path.join(options.projectRoot, ".ans", "sessions", options.roleId, options.runtime);
}

function validateRecord(value: unknown, scope: RuntimeSessionStoreOptions): RuntimeSessionRecord {
  if (!value || typeof value !== "object") throw new Error("ANS 会话索引格式无效");
  const record = value as RuntimeSessionRecord;
  if (record.version !== 1 || !record.id || record.roleId !== scope.roleId || record.runtime !== scope.runtime ||
      !["in-memory", "fresh", "resumed", "recovered"].includes(record.contextSource) ||
      typeof record.createdAt !== "string" || typeof record.updatedAt !== "string" ||
      (record.nativeSessionId !== undefined && typeof record.nativeSessionId !== "string") ||
      (record.contextWarning !== undefined && typeof record.contextWarning !== "string")) {
    throw new Error("ANS 会话索引与当前角色/运行时不匹配或格式无效");
  }
  return record;
}

/** Avoid following directory symlinks into another role or runtime during read/write. */
async function checkDirectoryChain(root: string, directory: string): Promise<void> {
  const rel = path.relative(root, directory);
  let current = root;
  for (const segment of ["", ...rel.split(path.sep)]) {
    if (segment) current = path.join(current, segment);
    const stat = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (stat?.isSymbolicLink() || (stat && !stat.isDirectory())) throw new Error(`会话目录不是普通目录：${current}`);
  }
}

async function readOptional(file: string): Promise<string | undefined> {
  const stat = await lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!stat) return undefined;
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`ANS 会话文件不是普通文件：${file}`);
  return readFile(file, "utf8");
}

const reportQueues = new Map<string,Promise<unknown>>();
export function createRuntimeSessionStore(options: RuntimeSessionStoreOptions): RuntimeSessionStorage {
  const directory = runtimeSessionDirectory(options);
  const ansDirectory = path.join(directory, "ans");
  const nativeDirectory = path.join(directory, "native");
  const indexFile = path.join(ansDirectory, "index.json");
  const replayFile = path.join(ansDirectory, "replay.jsonl");
  let queue = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
  const validateNativeDirectory = () => checkDirectoryChain(options.projectRoot, nativeDirectory);
  const check = async () => { await checkDirectoryChain(options.projectRoot, ansDirectory); await validateNativeDirectory(); };
  const prepare = async () => {
    await check();
    await mkdir(ansDirectory, { recursive: true, mode: 0o700 });
    await check();
  };
  return {
    runtime: options.runtime,
    roleId: options.roleId,
    directory,
    nativeDirectory,
    validateNativeDirectory,
    prepareNativeDirectory: () => serialize(async () => {
      await validateNativeDirectory();
      await mkdir(nativeDirectory, { recursive: true, mode: 0o700 });
      await validateNativeDirectory();
    }),
    ...(options.runtime === "pi" ? { legacyDirectory: path.dirname(directory) } : {}),
    saveReport: (value) => {
      const report=validateReportSnapshot(value);
      if(report.source.roleId!==options.roleId||report.source.runtime!==options.runtime) return Promise.reject(new Error("INVALID"));
      const directoryKey=directory+"/reports";
      const work=(reportQueues.get(directoryKey)??Promise.resolve()).then(()=>serialize(async()=>{
        await prepare();
        const reportsDirectory=path.join(ansDirectory,"reports");
        await checkDirectoryChain(options.projectRoot,reportsDirectory);
        await mkdir(reportsDirectory,{recursive:true,mode:0o700});
        await checkDirectoryChain(options.projectRoot,reportsDirectory);
        const file=path.join(reportsDirectory,report.reportId+".json");
        const old=await readOptional(file);
        if(old!==undefined){const prior=validateReportSnapshot(JSON.parse(old));if(canonicalJson(prior)!==canonicalJson(report))throw new Error("CONFLICT");return "already-saved" as const;}
        await atomicWrite(file,JSON.stringify(report)+"\n",{mode:0o600});return "saved" as const;
      }));
      const settled=work.then(()=>undefined,()=>undefined);reportQueues.set(directoryKey,settled);void settled.finally(()=>{if(reportQueues.get(directoryKey)===settled)reportQueues.delete(directoryKey);});return work;
    },
    readReports: () => serialize(async()=>{
      await check();const dir=path.join(ansDirectory,"reports");await checkDirectoryChain(options.projectRoot,dir);
      const files=await readdir(dir).catch((error:NodeJS.ErrnoException)=>{if(error.code==='ENOENT')return [];throw error;});
      const reports:RuntimeReportSnapshotV1[]=[];const reportErrors:{reportId?:string;code:string}[]=[];
      for(const name of files.sort()){
        if(!/^[a-f0-9]{64}\.json$/.test(name)){reportErrors.push({code:'INVALID'});continue;}
        try{const raw=await readOptional(path.join(dir,name));const report=validateReportSnapshot(JSON.parse(raw??''));if(report.reportId!==name.slice(0,-5)||report.source.roleId!==options.roleId||report.source.runtime!==options.runtime)throw Error('INVALID');reports.push(report);}
        catch{reportErrors.push({reportId:name.slice(0,-5),code:'INVALID'});}
      }return {reports,reportErrors};
    }),
    checkpointReplay:()=>serialize(async()=>{await check();const raw=await readOptional(replayFile)??'';return {bytes:Buffer.byteLength(raw),sha256:createHash('sha256').update(raw).digest('hex')};}),
    repairReplayTail:(checkpoint,entries,record)=>serialize(async()=>{
      await prepare();const raw=await readOptional(replayFile)??'';const data=Buffer.from(raw);const prefix=data.subarray(0,checkpoint.bytes);
      if(prefix.length!==checkpoint.bytes||createHash('sha256').update(prefix).digest('hex')!==checkpoint.sha256)throw Error('REPLAY_CHANGED');
      const suffix=data.subarray(checkpoint.bytes).toString('utf8');
      if(suffix&&!suffix.endsWith('\n'))throw Error('REPLAY_DAMAGED');
      const lines=suffix? suffix.slice(0,-1).split('\n'):[];
      for(const line of lines)try{JSON.parse(line);}catch{throw Error('REPLAY_DAMAGED');}
      const intended=entries.map(entry=>JSON.stringify(entry));
      if(lines.length>intended.length||lines.some((line,index)=>line!==intended[index]))throw Error('REPLAY_CHANGED');
      if(record){validateRecord(record,options);await atomicWrite(indexFile,JSON.stringify(record)+'\n',{mode:0o600});}
      await atomicWrite(replayFile,prefix.toString('utf8')+intended.map(line=>line+'\n').join(''),{mode:0o600});
    }),
    readLatest: () => serialize(async () => {
      await check();
      const raw = await readOptional(indexFile);
      return raw === undefined ? undefined : validateRecord(JSON.parse(raw), options);
    }),
    saveSession: (record) => serialize(async () => {
      validateRecord(record, options);
      await prepare();
      await atomicWrite(indexFile, JSON.stringify(record) + "\n", { mode: 0o600 });
    }),
    appendReplay: (entries) => serialize(async () => {
      if (entries.length === 0) return;
      const lines = entries.map((entry) => {
        if (typeof entry.at !== "string" || !["user", "event"].includes(entry.kind) ||
            (entry.kind === "user" && typeof entry.text !== "string") ||
            (entry.kind === "event" && (!entry.event || typeof entry.event.summary !== "string"))) {
          throw new Error("ANS 回放条目格式无效");
        }
        return JSON.stringify(entry);
      }).join("\n") + "\n";
      await prepare();
      // Reject a substituted replay symlink before append; index uses atomic replacement.
      const existing = await lstat(replayFile).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error("ANS 回放文件不是普通文件");
      await appendFile(replayFile, lines, { mode: 0o600 });
    }),
    readReplay: () => serialize(async () => {
      await check();
      const raw = await readOptional(replayFile);
      if (raw === undefined) return [];
      return raw.split("\n").filter((line) => line.trim()).map((line, index) => {
        let entry: RuntimeReplayEntry;
        try { entry = JSON.parse(line) as RuntimeReplayEntry; }
        catch { throw new Error(`ANS 回放第 ${index + 1} 行格式无效`); }
        if (!entry || typeof entry.at !== "string" || !["user", "event"].includes(entry.kind) ||
            (entry.kind === "user" && typeof entry.text !== "string") ||
            (entry.kind === "event" && (!entry.event || typeof entry.event.summary !== "string"))) {
          throw new Error(`ANS 回放第 ${index + 1} 行格式无效`);
        }
        return entry;
      });
    }),
  };
}

export async function readRuntimeSessionHistory(options: RuntimeSessionStoreOptions): Promise<{
  record?: RuntimeSessionRecord; entries: RuntimeReplayEntry[];
}> {
  const store = createRuntimeSessionStore(options);
  const record = await store.readLatest();
  return { ...(record ? { record } : {}), entries: await store.readReplay() };
}
