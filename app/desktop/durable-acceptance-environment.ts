import { createHash } from "node:crypto";
import { constants, lstatSync, realpathSync } from "node:fs";
import { lstat, mkdir, open, realpath } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { isolatePackageManifest, readPackageManifest, verifyPackageLock } from "../../src/common/runtime-core/governed-package-lock.ts";
import type { DurableAcceptanceEnvironmentBasis, DurableAcceptanceEnvironmentMissing, DurableEvidenceRef, DurablePendingTask, DurableProjection, DurableResult, DurableTaskBinding } from "../../src/model/durable-workflow.ts";
import type { AcceptanceEnvironmentRestoreFn, AcceptanceEnvironmentReviewScope, AcceptanceEnvironmentShellObservation, FixedCloseCreatedTaskFn, TaskClosedOutcome } from "../../src/model/runtime.ts";
import type { TaskHandback } from "../../src/common/编排/handback.ts";
import { appendTaskEvent, readTaskState, taskEvent } from "../../src/common/编排/task-state.ts";
import { durableHash, type DesktopDurableWorkflow } from "./durable-workflow.ts";
import { graphTurn, workflowTaskEffectMatches } from "./durable-workflow-a.ts";
import { prepareAcceptanceNpm } from "./governed-package-lock.ts";
import type { LiveSession } from "./session/contracts/session-types.ts";
import { acceptanceDependencyParent, acquireProjectGitCriticalSection, inspectAcceptanceDependencies, readAcceptanceEnvironmentGit, type AcceptanceEnvironmentGitFacts } from "./workflow-git.ts";

type Condition = DurableAcceptanceEnvironmentMissing["condition"];
type Store = Awaited<ReturnType<DesktopDurableWorkflow["store"]>>;
type JsonRecord = Record<string, unknown>;

interface VerifiedInputs {
  git: AcceptanceEnvironmentGitFacts;
  manifest: DurableEvidenceRef;
  lock?: DurableEvidenceRef;
  isolatedManifest: Buffer;
  lockBytes?: Buffer;
  condition: Condition;
  requiredScripts: readonly string[];
  buildRequiredByStandard: boolean;
  projectInstallationExists: boolean;
  workspaceBuild: boolean;
  present: boolean;
}

function failure(code: string, message: string): { ok: false; code: string; message: string } {
  return { ok: false, code: `workflow-environment-${code}`, message };
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

async function entriesAt(file: string) {
  return lstat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
}

/** Read a single file without following a link, traversing a reparse directory or accepting a rotated file. */
async function boundedFile(root: string, relative: string, limit: number): Promise<Buffer> {
  const expected = path.resolve(root, relative);
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).includes("..") ||
    path.relative(expected, await realpath(expected))) throw new Error("输入文件路径未经核对。");
  const before = await lstat(expected);
  if (!before.isFile() || before.nlink !== 1 || before.size < 1 || before.size > limit) throw new Error("输入文件不是可读取的普通文件。");
  const handle = await open(expected, constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NOFOLLOW));
  try {
    const matches = (observed: Awaited<ReturnType<typeof handle.stat>>) =>
      observed.isFile() && observed.nlink === 1 && observed.dev === before.dev && observed.ino === before.ino
      && observed.size === before.size && observed.mtimeMs === before.mtimeMs && observed.ctimeMs === before.ctimeMs;
    if (!matches(await handle.stat())) throw new Error("读取期间输入文件已变化。");
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) throw new Error("读取期间输入文件已变化。");
      offset += bytesRead;
    }
    if (!matches(await handle.stat()) || !matches(await lstat(expected)) || path.relative(expected, await realpath(expected))) {
      throw new Error("读取期间输入文件已变化。");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function readAcceptanceEnvironmentVerdict(root: string, evidence: DurableEvidenceRef): Promise<JsonRecord | undefined> {
  try {
    const bytes = await boundedFile(root, evidence.path, 256 * 1024);
    if (digest(bytes) !== evidence.sha256) return undefined;
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(bytes.toString("utf8"))?.[1];
    return header ? asRecord(parse(header)) : undefined;
  } catch {
    return undefined;
  }
}

function explicitNpmScripts(criteria: string): string[] {
  return [...criteria.matchAll(/\bnpm\s+(?:(?:run|run-script)\s+([\w:-]+)|(start|test)\b)/g)]
    .map(match => match[1] ?? match[2]!);
}

/** Preserve the existing build evidence rule for an assessment that did not enter recovery. */
function assessmentRequiresBuild(criteria: string, explicit: readonly string[], scripts: JsonRecord): boolean {
  if (explicit.length) return explicit.includes("build");
  if (typeof scripts.build !== "string") return false;
  return criteria.split(/[\r\n。；！？;]+/).some(clause =>
    !/(?:不要求|无需|不必|无须|可省略)\s*(?:本地|生产|项目|静态|实际)?\s*(?:构建|启动|运行)|\b(?:no need to|need not|not required to)\s+(?:build|start|run)\b/i.test(clause)
    && (/(?:本地|生产|项目|静态)\s*构建|\b(?:local|production|project)\s+build\b/i.test(clause)
      || /(?:记录|核对|验证|检查)\s*(?:实际(?:的)?\s*)?构建(?:\s*[/／、与和或]\s*启动)?\s*(?:指令|命令|脚本)\s*(?:及|和|与|、)\s*(?:实际)?(?:执行)?(?:结果|输出)/.test(clause)
      || /\b(?:record|verify|check)\s+(?:the\s+)?(?:actual\s+)?build(?:\s*(?:\/|and|or)\s*(?:start|startup))?\s+(?:commands?|scripts?)\s+(?:and|with)\s+(?:their\s+)?(?:results?|output)\b/i.test(clause)));
}

function executablePackage(executable: string, manifest: JsonRecord, lock: JsonRecord): string | undefined {
  const declared = new Set(["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]
    .flatMap(key => Object.keys(asRecord(manifest[key]))));
  const matches = [...declared].filter(name => {
    const entry = asRecord(asRecord(lock.packages)[`node_modules/${name}`]);
    if (typeof entry.bin === "string") return name.split("/").at(-1) === executable;
    if (entry.bin !== undefined) return Object.hasOwn(asRecord(entry.bin), executable);
    return name.split("/").at(-1) === executable;
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function declaredExecutable(scripts: JsonRecord, script: string): string | undefined {
  const body = scripts[script];
  if (typeof body !== "string" || scripts[`pre${script}`] || scripts[`post${script}`]) return undefined;
  // The initial executable of a direct command can be recovered mechanically. Shell programs, pipelines and
  // compound scripts are left to the regular assessment path because a later command may be the failing operation.
  return /^[ \t]*([a-zA-Z0-9][a-zA-Z0-9_.-]*)(?:[ \t]+[^\r\n;|&><`$]*|[ \t]*)$/.exec(body)?.[1];
}

async function localExecutable(root: string, packageName: string, executable: string): Promise<boolean> {
  const installed = path.join(root, "node_modules");
  const pkg = path.join(installed, packageName);
  const packageManifest = await boundedFile(root, path.relative(root, path.join(pkg, "package.json")), 256 * 1024);
  const document = asRecord(JSON.parse(packageManifest.toString("utf8")));
  const entry = typeof document.bin === "string" && packageName.split("/").at(-1) === executable
    ? document.bin : asRecord(document.bin)[executable];
  if (document.name !== packageName || typeof entry !== "string") return false;
  const script = path.resolve(pkg, entry);
  const relative = path.relative(pkg, script);
  if (!relative || path.isAbsolute(relative) || relative.split(path.sep).includes("..")
    || path.relative(script, await realpath(script)) || !(await lstat(script)).isFile()) return false;
  const bin = path.join(installed, ".bin");
  if (path.relative(bin, await realpath(bin))) return false;
  if (process.platform !== "win32") return !path.relative(script, await realpath(path.join(bin, executable)));
  const shim = await boundedFile(root, path.relative(root, path.join(bin, `${executable}.cmd`)), 64 * 1024);
  const expectedTarget = path.relative(bin, script).replace(/\\/g, "/");
  return shim.toString("utf8").replace(/\\/g, "/").includes(expectedTarget);
}

function supportedWorkspaceBuild(manifest: JsonRecord): boolean {
  const scripts = asRecord(manifest.scripts);
  const dependencies = { ...asRecord(manifest.dependencies), ...asRecord(manifest.devDependencies) };
  return Object.hasOwn(dependencies, "vite") && typeof scripts.build === "string"
    && /^(?:tsc[ \t]+--noEmit[ \t]+&&[ \t]+)?vite[ \t]+build$/.test(scripts.build.trim())
    && scripts.prebuild === undefined && scripts.postbuild === undefined;
}

export async function verifyAcceptanceEnvironment(
  projectRoot: string, basis: DurableAcceptanceEnvironmentBasis,
  expected?: Pick<DurableAcceptanceEnvironmentMissing, "manifest" | "lock" | "condition" | "installTarget">,
  options?: { workspaceProof?: boolean; privateParent?: string },
): Promise<DurableResult<VerifiedInputs | undefined>> {
  const git = await readAcceptanceEnvironmentGit(projectRoot, basis.branch, basis.candidateOid);
  if (!git.ok) return git;
  const { root } = git.value;
  try {
    const criteriaBytes = await boundedFile(root, basis.criteria.path, 256 * 1024);
    if (digest(criteriaBytes) !== basis.criteria.sha256) return failure("criteria-drift", "当前独立验收标准已经变化。");
    const criteria = criteriaBytes.toString("utf8");
    const explicit = explicitNpmScripts(criteria);
    if (!git.value.hasManifest) {
      return !expected && !explicit.length ? { ok: true, value: undefined }
        : failure("package-manifest", "当前 npm 验收要求缺少候选中已跟踪的 package.json。");
    }
    const bytes = await readPackageManifest(root);
    const source = asRecord(JSON.parse(bytes.toString("utf8")));
    const scripts = asRecord(source.scripts);
    const required = [...new Set([...explicit, ...["build", "start", "dev"].filter(script => typeof scripts[script] === "string")])];
    if (!required.length && !expected) return { ok: true, value: undefined };
    if (source.packageManager !== undefined && (typeof source.packageManager !== "string" || !/^npm@\d/.test(source.packageManager))) {
      return failure("package-manager", "候选声明了当前恢复不支持的包管理器。");
    }
    for (const config of [".npmrc", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb"]) {
      if (await entriesAt(path.join(root, config))) {
        return failure("package-source", `候选存在未经当前恢复规则核验的配置或锁文件 ${config}。`);
      }
    }
    const isolatedManifest = isolatePackageManifest(bytes);
    const lockBytes = await entriesAt(path.join(root, "package-lock.json"))
      ? await boundedFile(root, "package-lock.json", 4 * 1024 * 1024) : undefined;
    if (lockBytes) verifyPackageLock(lockBytes, isolatedManifest);
    else if (/(?:lock\s*file|package-lock\.json|锁文件)/i.test(criteria)) {
      return failure("lock-required", "当前标准涉及锁文件，需核对正式锁文件或按原渠道澄清标准。");
    }
    const manifest = { path: "package.json", sha256: digest(bytes) };
    const lock = lockBytes ? { path: "package-lock.json", sha256: digest(lockBytes) } : undefined;
    if (expected && (expected.manifest.sha256 !== manifest.sha256 || expected.lock?.sha256 !== lock?.sha256)) {
      return failure("package-input-drift", "候选的依赖清单或锁文件已经变化。");
    }
    const rootTarget = path.join(root, "node_modules");
    const existingRoot = await entriesAt(rootTarget);
    if (existingRoot && (!existingRoot.isDirectory() || path.relative(rootTarget, await realpath(rootTarget)))) {
      return failure("install-target", "现有 node_modules 目录无法核对为当前项目普通目录。");
    }
    const isPrivate = expected?.installTarget === "assessment-private";
    const installParent = isPrivate ? options?.privateParent : root;
    const installTarget = installParent && path.join(installParent, "node_modules");
    const target = isPrivate ? installTarget ? await entriesAt(installTarget) : undefined : existingRoot;
    if (target && (!target.isDirectory() || !installTarget || path.relative(installTarget, await realpath(installTarget)))) {
      return failure("install-target", "本次安装目标路径无法核对为普通目录。");
    }
    const workspaceBuild = supportedWorkspaceBuild(source);
    const lockDocument = lockBytes ? asRecord(JSON.parse(lockBytes.toString("utf8"))) : {};
    for (const script of required) {
      if (expected && expected.condition.script !== script) continue;
      const executable = declaredExecutable(scripts, script);
      const pkg = executable && executablePackage(executable, source, lockDocument);
      if (!executable || !pkg || expected && expected.condition.executable !== executable) continue;
      const condition: Condition = { kind: "npm-local-executable", script, executable };
      const present = !!(target && installParent && await localExecutable(installParent, pkg, executable).catch(() => false));
      if (target && !present && !(options?.workspaceProof && workspaceBuild && !isPrivate)) {
        return failure("install-target-owned", "现有 node_modules 不具备本次所需入口，原目录保留，需核对其归属和替换权限。");
      }
      return { ok: true, value: { git: git.value, manifest, lock, isolatedManifest, lockBytes, condition,
        requiredScripts: required, buildRequiredByStandard: assessmentRequiresBuild(criteria, explicit, scripts),
        projectInstallationExists: existingRoot !== undefined, workspaceBuild, present } };
    }
    return failure("script-unsupported", "当前标准要求的本地脚本无法对应到一个可核验的已声明 npm 执行入口。");
  } catch {
    return failure("inputs-unverified", "无法核验当前标准、项目清单和公共 npm 依赖来源。");
  }
}

function identicalAssessmentTask(left: DurableTaskBinding | undefined, right: DurableTaskBinding): boolean {
  return left?.taskId === right.taskId && left.roleId === right.roleId && left.stage === right.stage
    && left.stageAttempt === right.stageAttempt && left.executionAttempt === right.executionAttempt && left.parentTaskId === right.parentTaskId;
}

export function assessmentHasEnvironmentFact(store: Store, view: DurableProjection, task: DurableTaskBinding): boolean {
  return store.listCapabilityEvents(view.ref).some(({ event, receipt }) => receipt.state !== "ignored"
    && event.stepId === view.stepId && event.attempt === view.attempt && event.input.kind === "environment-missing"
    && identicalAssessmentTask(event.input.missing.basis.assessmentTask, task));
}

/** Checks a bound A12b task before its desktop journal or command delivery is materialized. */
export async function prepareAcceptanceEnvironmentDispatch(
  store: Store, view: DurableProjection, pending: DurablePendingTask,
): Promise<{ hold: true } | { hold: false; instructions: string }> {
  const { ref, projectRoot, stepId, attempt } = view;
  const env = view.acceptanceEnvironment;
  const basis = env?.basis;
  const deliver = (instructions = "") => ({ hold: false as const, instructions });
  const hold = { hold: true as const };
  if (view.schema !== 2 || !view.workflowOwnedDispatch || !env?.enabled || !basis
    || pending.capability !== "independent-assessment" || pending.task.stage !== "A12b"
    || !identicalAssessmentTask(basis.assessmentTask, pending.task)) return deliver();
  const current = () => {
    const now = store.lookup(ref);
    const currentBasis = now?.acceptanceEnvironment?.basis;
    return now?.engine === "healthy" && now.status === "waiting" && now.action === "independent-assessment"
      && now.projectRoot === projectRoot && now.flowId === view.flowId && now.stepId === stepId && now.attempt === attempt
      && now.acceptanceEnvironment?.enabled === true && currentBasis?.candidateOid === basis.candidateOid
      && currentBasis.branch === basis.branch && currentBasis.criteria.path === basis.criteria.path && currentBasis.criteria.sha256 === basis.criteria.sha256
      && identicalAssessmentTask(currentBasis.assessmentTask, pending.task)
      && now.pendingTasks?.some(task => task.state === "pending" && !task.report && task.stepId === stepId && task.attempt === attempt
        && task.capability === pending.capability && identicalAssessmentTask(task.task, pending.task)) === true;
  };
  const handled = () => assessmentHasEnvironmentFact(store, view, pending.task);
  const deliveryStarted = () => store.listEffects(ref).some(effect => (effect.intent.kind === "dispatch" || effect.intent.kind === "model-send"
    || effect.intent.kind === "acceptance-check-command") && workflowTaskEffectMatches(effect, pending));
  if (!current() || handled()) return hold;
  const checked = await verifyAcceptanceEnvironment(projectRoot, basis, undefined, { workspaceProof: !!view.acceptanceWorkspace });
  if (!current() || handled()) return hold;
  const problem = (message: string) => deliver(`\n应用前检遇到的问题：${message} 如果无法安全检查，请在正式报告中记录阻塞与未验证条目。`);
  if (!checked.ok) return problem(checked.message);
  if (!checked.value) return deliver();
  const workspaceProof = !!view.acceptanceWorkspace && checked.value.workspaceBuild;
  const accepted = workspaceProof && await acceptedAcceptanceDependencyProof(store, view, basis, checked.value);
  if (!current() || handled()) return hold;
  if (accepted || !workspaceProof && checked.value.present) return deliver(
    `\n应用已核对本地前置条件。按当前转交的 ${basis.criteria.path} 对同一候选独立实测。构建和试玩使用项目已获准的忽略目录或应用认可的隔离输出，并保留现有输出。若项目构建工具支持指定目录，可将输出选为本任务专用的 .ans/acceptance-runs/${pending.taskId}，先核对其不存在。依赖已安装仍需独立实测。`);
  const { manifest, lock, condition } = checked.value;
  const installTarget = workspaceProof && checked.value.projectInstallationExists ? "assessment-private" as const : undefined;
  if (!deliveryStarted()) {
    const journal = await readTaskState(projectRoot);
    if (!current() || handled()) return hold;
    // The workflow store validates journal read errors. This check is specific to the task being dispatched.
    if (!journal.records.has(pending.taskId) && !deliveryStarted()) {
      const saved = await store.recordAcceptanceEnvironmentMissing(ref, { origin: "preflight", basis, manifest, lock, condition,
        ...(installTarget ? { installTarget } : {}) },
        () => current() && !deliveryStarted());
      if ((saved.ok && saved.value.state !== "ignored") || !current() || handled()) return hold;
      if (!saved.ok && !deliveryStarted()) return problem(saved.message);
    }
  }
  if (installTarget) return problem("当前候选缺少通过验收前检的依赖安装回执，原项目依赖目录已保留。");
  return deliver(`\n应用已核对当前候选与 ${basis.criteria.path}，并确认 npm 脚本 ${condition.script} 所需的本地入口 ${condition.executable} 缺失。未执行的检查请按正式报告记录阻塞与缺项，frontmatter 可包含 environmentMissing: { script: "${condition.script}", executable: "${condition.executable}" }。已执行的检查请记录实际结果。`);
}

export function sameAcceptanceEnvironmentGit(before: AcceptanceEnvironmentGitFacts, after: AcceptanceEnvironmentGitFacts): boolean {
  return before.root === after.root && before.branch === after.branch && before.head === after.head
    && before.indexDigest === after.indexDigest && before.untrackedDigest === after.untrackedDigest;
}

export function acceptanceEnvironmentTask(view: DurableProjection, roleId: string, taskId: string, part: "parent" | "child"): DurablePendingTask | undefined {
  const env = view.acceptanceEnvironment;
  const binding = part === "parent" ? env?.parentTask : env?.childTask;
  if (view.status !== "waiting" || view.engine !== "healthy" || env?.state !== "recovering" || binding?.roleId !== roleId || binding.taskId !== taskId) {
    return undefined;
  }
  return view.pendingTasks?.find(task => task.environmentRecovery === part && task.taskId === taskId
    && task.roleId === roleId && task.stepId === view.stepId && task.attempt === view.attempt);
}

function npmScript(argv: readonly string[]): string | undefined {
  if (argv[0] !== "npm") return undefined;
  if ((argv[1] === "run" || argv[1] === "run-script") && (argv.length === 3 || argv[3] === "--")) return argv[2];
  return (argv.length === 2 || argv[2] === "--") && (argv[1] === "start" || argv[1] === "test") ? argv[1] : undefined;
}

function missingCommand(stderr: string | undefined, executable: string): boolean {
  const literal = executable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return !!stderr && new RegExp(`(?:^|[\\r\\n])[^\\r\\n]{0,120}(?:['"\\s]|^)${literal}(?:['"\\s:]|$)[^\\r\\n]{0,100}(?:not recognized|not found|找不到|不是内部或外部命令)\\b`, "i").test(stderr);
}

export function acceptanceCommandObserver(durable: DesktopDurableWorkflow, session: () => LiveSession | undefined) {
  const get = graphTurn(durable, session);
  return async (observation: AcceptanceEnvironmentShellObservation): Promise<void> => {
    const script = npmScript(observation.argv);
    const live = script && await get();
    if (!live) return;
    const { view, source, delivery, entry, current } = live;
    const basis = view.acceptanceEnvironment?.basis;
    const task = basis?.assessmentTask;
    if (!basis || !task || task.taskId !== delivery.intent.task?.taskId || task.taskId !== entry.assignedTaskId
      || task.roleId !== observation.roleId || source.originId !== observation.turnId
      || path.relative(view.projectRoot, observation.cwd)) return;
    const pending = view.pendingTasks?.find(item => item.taskId === task.taskId && item.state === "pending" && item.stepId === view.stepId && item.attempt === view.attempt);
    if (!pending || !current()) return;
    const store = await durable.store();
    const key = `acceptance-check-command:${task.taskId}:${durableHash(observation.toolCallId)}`;
    const claimed = await store.claimEffect(view.ref, { key, kind: "acceptance-check-command", stepId: pending.stepId, attempt: pending.attempt, task });
    if (!claimed.ok) throw new Error(claimed.message);
    if (!claimed.value.execute) return;
    const proven = await verifyAcceptanceEnvironment(view.projectRoot, basis);
    const condition = proven.ok ? proven.value?.condition : undefined;
    const actualExit = observation.outcome?.exitCode;
    const verifiedExit = observation.decision === "allowed" && !observation.outcome?.error && !observation.outcome?.timedOut
      && !observation.outcome?.signal && observation.writeAuditPassed === true && typeof actualExit === "number" && Number.isSafeInteger(actualExit) && actualExit >= 0
      ? String(actualExit) : "";
    const result = { script, turnId: observation.turnId, decision: observation.decision, verifiedExit,
      missingExecutable: verifiedExit !== "" && verifiedExit !== "0" && condition?.script === script && missingCommand(observation.stderr, condition.executable)
        ? condition.executable : "", receiptId: durableHash(JSON.stringify([key, observation.turnId, observation.argv, observation.decision, verifiedExit])),
      reviewedBy: observation.reviewedBy ?? "", argv: [...observation.argv] };
    if (!(await store.settleEffect(view.ref, { key, token: claimed.value.token, outcome: "succeeded",
      evidence: "Application ShellGate decision and actual foreground execution observation.", result })).ok) {
      throw new Error("本次验收命令回执无法持久登记。");
    }
  };
}

export async function recordAcceptanceEnvironmentReport(input: {
  store: Store; view: DurableProjection; pending: DurablePendingTask; reportKey: string; originId: string; report: DurableEvidenceRef; artifact: DurableEvidenceRef;
}): Promise<DurableResult<"recorded" | "ordinary">> {
  const { store, view, pending, reportKey, originId, report, artifact } = input;
  const basis = view.acceptanceEnvironment?.basis;
  if (!basis || !view.acceptanceEnvironment?.enabled || pending.taskId !== basis.assessmentTask.taskId) return { ok: true, value: "ordinary" };
  const verdict = await readAcceptanceEnvironmentVerdict(view.projectRoot, artifact);
  if (verdict?.candidateOid !== basis.candidateOid || verdict.outcome !== "blocked") return { ok: true, value: "ordinary" };
  const proposed = asRecord(verdict.environmentMissing);
  const proven = await verifyAcceptanceEnvironment(view.projectRoot, basis);
  if (!proven.ok) return proven;
  if (!proven.value || proven.value.present) return { ok: true, value: "ordinary" };
  const { manifest, lock, condition, requiredScripts } = proven.value;
  const applicable = store.listEffects(view.ref, "acceptance-check-command").filter(row => {
    const observed = row.result?.result;
    return workflowTaskEffectMatches(row, pending) && (row.state === "claimed" || row.state === "unknown"
      || observed?.turnId === originId && typeof observed.script === "string" && requiredScripts.includes(observed.script));
  });
  const attempted = applicable.findLast(row => row.state === "claimed" || row.state === "unknown"
    || row.result?.result?.script === condition.script) ?? applicable.at(-1);
  const result = attempted?.result?.result;
  if (attempted && (attempted.state !== "succeeded" || result?.script !== condition.script || result.decision !== "allowed" || result.missingExecutable !== condition.executable
    || typeof result.receiptId !== "string")) return { ok: true, value: "ordinary" };
  if (!attempted && (proposed.script !== condition.script || proposed.executable !== condition.executable)) return { ok: true, value: "ordinary" };
  const current = () => {
    const now = store.lookup(view.ref);
    return now?.status === "waiting" && now.engine === "healthy" && now.stepId === view.stepId && now.attempt === view.attempt
      && now.acceptanceEnvironment?.basis?.assessmentTask.taskId === pending.taskId;
  };
  const recorded = await store.recordAcceptanceEnvironmentMissing(view.ref, { origin: "report", basis, manifest, lock, condition, reportKey, report, originId,
    ...(typeof result?.receiptId === "string" ? { commandReceiptId: result.receiptId } : {}) }, current);
  if (!recorded.ok) return recorded;
  return { ok: true, value: recorded.value.state === "ignored" ? "ordinary" : "recorded" };
}

export async function confirmAcceptanceEnvironmentAssessment(
  store: Store, view: DurableProjection, pending: DurablePendingTask, turnId: string,
): Promise<DurableResult<true>> {
  const workspace = view.acceptanceWorkspace;
  if (workspace?.basis.assessmentTask.taskId === pending.taskId) {
    if (workspace.state === "blocked") return failure("assessment-workspace-blocked", workspace.reason ?? "验收工作区受阻。");
    if (workspace.binding) {
      const receipt = workspace.receipt;
      if (workspace.binding.operation === "static") {
        const requirements = workspace.binding.staticRequirements;
        if (!requirements || requirements.build || requirements.requireDeliveryStartup || requirements.requireLogicTest) {
          return failure("assessment-workspace-blocked", "签发标准还要求实际构建、交付启动或逻辑测试，当前静态预览未核实所需独立操作。");
        }
        return receipt?.kind === "acceptance-workspace-static-run" && receipt.stage.turnId === turnId && receipt.stage.writeAuditPassed
          ? { ok: true, value: true }
          : failure("assessment-unexercised", "当前独立回合缺少获应用批准、与候选文件摘要一致的静态准备及预览回执。");
      }
      const build = receipt?.kind === "acceptance-workspace-run" ? receipt.build : undefined;
      return build?.turnId === turnId && build.exitCode === 0 && build.writeAuditPassed
        ? { ok: true, value: true }
        : failure("assessment-unexercised", "当前独立回合缺少获应用批准且实际成功退出的验收工作区构建。");
    }
  }
  const env = view.acceptanceEnvironment;
  if (!env?.enabled || !env.basis || env.basis.assessmentTask.taskId !== pending.taskId) return { ok: true, value: true };
  const checked = await verifyAcceptanceEnvironment(view.projectRoot, env.basis);
  if (!checked.ok) {
    // The restoration mechanism's narrower package support does not replace an ordinary completed assessment.
    if (env.state === "assessment" && ["workflow-environment-script-unsupported", "workflow-environment-package-manager",
      "workflow-environment-package-source", "workflow-environment-inputs-unverified"].includes(checked.code)) return { ok: true, value: true };
    return checked;
  }
  if (checked.value?.present === false) return failure("assessment-unexercised", "独立复验所需的本地 npm 执行入口仍然缺少。");
  if (checked.value && (checked.value.buildRequiredByStandard || env.state === "rechecking" && checked.value.requiredScripts.includes("build"))) {
    const observation = store.listEffects(view.ref, "acceptance-check-command").findLast(row => workflowTaskEffectMatches(row, pending)
      && row.result?.result?.turnId === turnId && row.result.result.script === "build");
    if (observation?.state !== "succeeded" || observation.result?.result?.decision !== "allowed" || observation.result.result.verifiedExit !== "0") {
      return failure("assessment-unexercised", "当前独立回合缺少获应用批准且实际成功退出的本地构建。");
    }
  }
  return { ok: true, value: true };
}

export type PreflightEnvironmentOwner = (projectRoot: string, roleId: string) => Promise<DurableResult<true>>;

interface CommandReceipt {
  kind: "npm-environment-install";
  taskId: string;
  turnId: string;
  toolCallId: string;
  decision: "allowed" | "denied" | "unavailable";
  reviewedBy?: string;
  argv: readonly string[];
  cwd: string;
  acceptanceEnvironmentScope?: AcceptanceEnvironmentReviewScope;
  dependenciesSha256?: string;
  dependenciesLocation?: { path: string; identity: DirectoryIdentity };
  candidateOid: string;
  result: "installed" | "retryable" | "blocked";
  reason: string;
  git?: AcceptanceEnvironmentGitFacts;
  process?: Awaited<ReturnType<Extract<Awaited<ReturnType<typeof prepareAcceptanceNpm>>, { ok: true }>["value"]["execute"]>>;
}

type DirectoryIdentity = AcceptanceEnvironmentReviewScope["stagingIdentity"];

export interface VerifiedAcceptanceDependencyProof {
  receiptId: string;
  parent: string;
  path: string;
  identity: DirectoryIdentity;
  sha256: string;
}

function installIdentity(directory: string): DirectoryIdentity | undefined {
  try {
    const stat = lstatSync(directory, { bigint: true });
    if (!stat.isDirectory() || path.relative(directory, realpathSync.native(directory))) return;
    return { dev: stat.dev.toString(), ino: stat.ino.toString() };
  } catch { return undefined; }
}

function sameIdentity(left: DirectoryIdentity | undefined, right: DirectoryIdentity | undefined): boolean {
  return !!left && !!right && left.dev === right.dev && left.ino === right.ino;
}

function sameEvidence(left: DurableEvidenceRef | undefined, right: DurableEvidenceRef | undefined): boolean {
  return left?.path === right?.path && left?.sha256 === right?.sha256;
}

export async function acceptedAcceptanceDependencyProof(
  store: Store, view: DurableProjection, basis: DurableAcceptanceEnvironmentBasis,
  inputs: Pick<VerifiedInputs, "manifest" | "lock">,
): Promise<VerifiedAcceptanceDependencyProof | undefined> {
  const events = store.listCapabilityEvents(view.ref).filter(row => row.receipt.state === "consumed" && row.event.flowId === view.flowId);
  const installed = store.listEffects(view.ref, "environment-install");
  const missingIndex = events.findLastIndex(({ event }) => event.input.kind === "environment-missing"
    && event.input.missing.basis.candidateOid === basis.candidateOid && event.input.missing.basis.branch === basis.branch
    && sameEvidence(event.input.missing.basis.criteria, basis.criteria) && sameEvidence(event.input.missing.manifest, inputs.manifest)
    && sameEvidence(event.input.missing.lock, inputs.lock));
  const missing = events[missingIndex]?.event.input;
  if (!missing || missing.kind !== "environment-missing") return;
  for (const { event } of events.slice(missingIndex + 1).reverse()) {
    if (event.input.kind !== "environment-recovery-settled" || event.input.settlement.outcome.kind !== "restored") continue;
    const { outcome, childTask, parentTask } = event.input.settlement;
    if (!childTask || childTask.parentTaskId !== parentTask.taskId || parentTask.parentTaskId !== view.ref.instanceId) continue;
    const id = outcome.commandReceiptId;
    const effect = installed.find(row => row.state === "succeeded" && row.intent.key === `environment-install:${childTask.taskId}`
      && identicalAssessmentTask(row.intent.task, childTask) && row.result?.result?.commandReceiptId === id);
    const receipt = effect && store.getEvidence(view.ref, { path: `ans-evidence/${id}`, sha256: id }) as CommandReceipt | undefined;
    const verified = asRecord(store.getEvidence(view.ref, outcome.verification));
    if (!receipt || receipt.candidateOid !== basis.candidateOid || receipt.git?.branch !== basis.branch || receipt.git.root !== view.projectRoot
      || receipt.kind !== "npm-environment-install" || receipt.decision !== "allowed" || receipt.result !== "installed"
      || receipt.taskId !== childTask.taskId || receipt.process?.status !== "exited" || receipt.process.exitCode !== 0 || !receipt.process.pid
      || !receipt.dependenciesSha256 || !/^[a-f0-9]{64}$/.test(receipt.dependenciesSha256)
      || verified.kind !== "npm-local-executable-verified" || verified.commandReceiptId !== id || verified.candidateOid !== basis.candidateOid
      || verified.taskId !== childTask.taskId || !sameEvidence(verified.criteria as DurableEvidenceRef, basis.criteria)
      || !sameEvidence(verified.manifest as DurableEvidenceRef, inputs.manifest) || !sameEvidence(verified.lock as DurableEvidenceRef, inputs.lock)) continue;
    const privateSlot = missing.missing.installTarget === "assessment-private";
    const scope = receipt.acceptanceEnvironmentScope;
    const parent = privateSlot ? acceptanceDependencyParent(view.projectRoot, childTask.taskId) : view.projectRoot;
    if (!parent) return;
    const directory = path.join(parent, "node_modules");
    const identity = installIdentity(directory);
    if (!identity || (privateSlot && (
      scope?.publishDirectory !== directory || scope.instanceId !== view.ref.instanceId || scope.flowId !== view.flowId
      || scope.taskId !== childTask.taskId || !sameIdentity(scope.publishIdentity, installIdentity(parent))
      || receipt.dependenciesLocation?.path !== directory || !sameIdentity(receipt.dependenciesLocation.identity, identity)
      || verified.dependenciesSha256 !== receipt.dependenciesSha256
      || asRecord(verified.dependenciesLocation).path !== directory
      || !sameIdentity(asRecord(verified.dependenciesLocation).identity as DirectoryIdentity, identity)
    )) || (!privateSlot && (scope?.publishIdentity !== undefined || scope?.publishDirectory !== undefined && scope.publishDirectory !== directory))) return;
    const actual = await inspectAcceptanceDependencies(parent).catch(() => undefined);
    if (actual !== receipt.dependenciesSha256 || !sameIdentity(identity, installIdentity(directory))) return;
    return { receiptId: id, parent, path: directory, identity, sha256: actual };
  }
}

function installReceipt(store: Store, view: DurableProjection, child: DurablePendingTask): { id: string; details: CommandReceipt } | undefined {
  const effect = store.listEffects(view.ref, "environment-install").find(row => row.intent.key === view.acceptanceEnvironment?.effectKey
    && row.state === "succeeded" && workflowTaskEffectMatches(row, child));
  const id = effect?.result?.result?.commandReceiptId;
  if (typeof id !== "string" || !/^[a-f0-9]{64}$/.test(id)) return undefined;
  const details = store.getEvidence(view.ref, { path: `ans-evidence/${id}`, sha256: id }) as CommandReceipt | undefined;
  return details?.kind === "npm-environment-install" && details.taskId === child.taskId
    && details.candidateOid === view.acceptanceEnvironment?.basis?.candidateOid ? { id, details } : undefined;
}

function stagingIdentity(root: string, staging: string): AcceptanceEnvironmentReviewScope["stagingIdentity"] | undefined {
  if (path.relative(path.join(root, ".ans"), path.dirname(staging)) || !/^acceptance-npm-[a-z0-9]{6}$/i.test(path.basename(staging))) return undefined;
  try {
    const stats = lstatSync(staging, { bigint: true });
    if (!stats.isDirectory() || path.relative(staging, realpathSync.native(staging))) return undefined;
    return { dev: stats.dev.toString(), ino: stats.ino.toString() };
  } catch {
    return undefined;
  }
}

function sameAcceptanceReviewScope(actual: AcceptanceEnvironmentReviewScope | undefined, expected: AcceptanceEnvironmentReviewScope): boolean {
  if (!actual) return false;
  const { stagingIdentity: observed, publishIdentity: observedPublish, ...fields } = actual;
  const { stagingIdentity: original, publishIdentity: originalPublish, ...bound } = expected;
  return observed?.dev === original.dev && observed.ino === original.ino && fields.lockSha256 === bound.lockSha256
    && (originalPublish ? sameIdentity(observedPublish, originalPublish) : observedPublish === undefined)
    && (Object.keys(bound) as (keyof typeof bound)[]).every(key => fields[key] === bound[key]);
}

export function acceptanceEnvironmentRestore(
  durable: DesktopDurableWorkflow, session: () => LiveSession | undefined, preflightOwner: PreflightEnvironmentOwner,
): AcceptanceEnvironmentRestoreFn {
  const get = graphTurn(durable, session);
  return async (call, signal) => {
    const live = await get();
    const env = live?.view.acceptanceEnvironment;
    const binding = live?.delivery.intent.task;
    if (!live || !env?.basis || !env.missing || !env.effectKey || !binding || call.turnId !== live.source.originId
      || call.roleId !== binding.roleId || binding.taskId !== live.entry.assignedTaskId || binding.taskId !== live.source.parentTaskId
      || path.relative(live.view.projectRoot, call.cwd)) return failure("restore-turn", "只有本次应用已绑定的恢复属主回合可以请求 npm 补齐。");
    const { view } = live;
    const { basis, missing, effectKey } = env;
    const { ref, projectRoot } = view;
    const child = acceptanceEnvironmentTask(view, call.roleId, binding.taskId, "child");
    if (!child || child.state !== "pending") return failure("restore-task", "当前恢复任务已经变化。");
    const store = await durable.store();
    const current = () => {
      const now = store.lookup(ref);
      const recovery = now?.acceptanceEnvironment;
      const currentBasis = recovery?.basis;
      const active = now && acceptanceEnvironmentTask(now, call.roleId, binding.taskId, "child");
      return !signal?.aborted && live.current() && now?.projectRoot === projectRoot && now.flowId === child.flowId
        && recovery?.effectKey === effectKey && currentBasis?.candidateOid === basis.candidateOid && currentBasis.branch === basis.branch
        && currentBasis.criteria.path === basis.criteria.path && currentBasis.criteria.sha256 === basis.criteria.sha256
        && recovery.missing?.manifest.sha256 === missing.manifest.sha256 && recovery.missing.lock?.sha256 === missing.lock?.sha256
        && recovery.missing.installTarget === missing.installTarget
        && active?.state === "pending" && identicalAssessmentTask(active.task, child.task);
    };
    if (!current()) return failure("restore-task", "当前恢复回合已经结束。");
    const owner = await preflightOwner(projectRoot, child.roleId);
    if (!owner.ok) return owner;
    const already = installReceipt(store, view, child);
    if (already) return failure("restore-already-recorded", `本次恢复已有实际应用回执 ${already.id}。请正式回交该回执与结果，让运营核对。`);
    if (store.listEffects(ref, "environment-install").some(effect => effect.intent.key === effectKey)) {
      return failure("restore-effect-uncertain", "本次作用已经认领，需先核对原实际回执。");
    }
    const prepared = await verifyAcceptanceEnvironment(projectRoot, basis, missing);
    if (!prepared.ok) return prepared;
    const privateInstall = missing.installTarget === "assessment-private";
    if (!prepared.value || prepared.value.present || prepared.value.projectInstallationExists !== privateInstall) {
      return failure("restore-install-target", "本次安装输出不是可创建的空缺目录，需人工核对当前实物。");
    }
    const before = prepared.value;
    const installParent = privateInstall ? acceptanceDependencyParent(before.git.root, child.taskId) : before.git.root;
    if (!installParent) return failure("restore-install-target", "当前任务无法绑定专用安装目标。");
    const staged = await prepareAcceptanceNpm(before.git.root, before.isolatedManifest, before.lockBytes);
    if (!staged.ok) return staged;
    const npm = staged.value;
    const dispose = async () => { await npm.dispose().catch(() => undefined); };
    const identity = stagingIdentity(before.git.root, npm.cwd);
    if (!current() || !identity) {
      await dispose();
      return failure("restore-scope-unverified", "当前回合或应用隔离目录的归属无法核对。");
    }
    let publishIdentity: DirectoryIdentity | undefined;
    if (privateInstall) {
      try {
        const owner = path.dirname(installParent);
        await mkdir(owner).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
        if (!installIdentity(owner) || !current()) throw new Error("专用安装目录不可核验。");
        await mkdir(installParent);
        publishIdentity = installIdentity(installParent);
        if (!publishIdentity) throw new Error("专用安装目录身份不可核验。");
      } catch {
        await dispose();
        return failure("restore-install-target", "当前恢复任务的专用安装目录已有内容、不可核验或任务已经变化。");
      }
    }
    const installOptions = privateInstall ? { privateParent: installParent } : undefined;
    const acceptanceEnvironmentScope: AcceptanceEnvironmentReviewScope = Object.freeze({
      kind: "application-isolated-npm-restore", projectRoot: before.git.root, stagingDirectory: npm.cwd,
      stagingIdentity: Object.freeze(identity), publishDirectory: path.join(installParent, "node_modules"),
      ...(publishIdentity ? { publishIdentity: Object.freeze(publishIdentity) } : {}),
      instanceId: ref.instanceId, flowId: child.flowId, stepId: child.stepId, attempt: child.attempt,
      taskId: child.taskId, roleId: child.roleId, turnId: call.turnId, toolCallId: call.toolCallId, effectKey,
      candidateOid: basis.candidateOid, manifestSha256: digest(before.isolatedManifest),
      ...(before.lockBytes ? { lockSha256: digest(before.lockBytes) } : {}), criteriaSha256: basis.criteria.sha256,
    });
    const claim = await store.claimEffect(ref, { key: effectKey, kind: "environment-install", stepId: view.stepId, attempt: view.attempt, task: child.task,
      ...(publishIdentity ? { expected: { installTarget: "assessment-private", publishDirectory: acceptanceEnvironmentScope.publishDirectory,
        publishDev: publishIdentity.dev, publishIno: publishIdentity.ino, stagingDirectory: npm.cwd, stagingDev: identity.dev, stagingIno: identity.ino,
        manifestSha256: acceptanceEnvironmentScope.manifestSha256,
        ...(acceptanceEnvironmentScope.lockSha256 ? { lockSha256: acceptanceEnvironmentScope.lockSha256 } : {}),
        criteriaSha256: basis.criteria.sha256, candidateOid: basis.candidateOid, turnId: call.turnId, toolCallId: call.toolCallId, argv: [...npm.argv] } } : {}) });
    if (!claim.ok || !claim.value.execute) {
      await dispose();
      return claim.ok ? failure("restore-effect-uncertain", "本次作用已被认领，必须核对原应用回执，不能再次运行。") : claim;
    }
    const scopedCurrent = () => {
      if (!current()) return false;
      const staging = stagingIdentity(before.git.root, npm.cwd);
      return staging?.dev === identity.dev && staging.ino === identity.ino
        && (!publishIdentity || sameIdentity(publishIdentity, installIdentity(installParent)))
        && store.listEffects(ref, "environment-install").some(effect => effect.intent.key === effectKey
          && effect.token === claim.value.token && effect.state === "claimed" && workflowTaskEffectMatches(effect, child));
    };
    const settle = async (input: Pick<CommandReceipt, "decision" | "reviewedBy" | "result" | "reason" | "process" | "git" | "dependenciesSha256" | "dependenciesLocation">) => {
      const evidence = store.storeEvidence(ref, { ...input, kind: "npm-environment-install", taskId: child.taskId,
        turnId: call.turnId, toolCallId: call.toolCallId, argv: [...npm.argv], cwd: npm.cwd, candidateOid: basis.candidateOid,
        acceptanceEnvironmentScope });
      if (!evidence.ok) return evidence;
      const id = evidence.value.sha256;
      const saved = await store.settleEffect(ref, { key: effectKey, token: claim.value.token, outcome: "succeeded",
        evidence: input.reason, result: { commandReceiptId: id } });
      return saved.ok ? { ok: true as const, value: id } : saved;
    };
    let completed = false;
    return { ok: true, value: {
      cwd: npm.cwd, argv: npm.argv, acceptanceEnvironmentScope, isCurrent: scopedCurrent,
      async reject({ decision, message }) {
        if (completed) return;
        completed = true;
        try {
          const reason = (decision === "denied" ? "本次依赖补齐命令未获应用批准。" : "应用无法完成本次命令审批或运行前核对。")
            + message.replace(/[\r\n\x00-\x1f]+/g, " ").slice(0, 250);
          const saved = await settle({ decision, result: "blocked", reason });
          if (!saved.ok) throw new Error(saved.message);
        } finally {
          await dispose();
        }
      },
      async executeApproved(approved, executionSignal) {
        if (completed) return failure("restore-effect-uncertain", "当前恢复作用已经完成或停止。");
        completed = true;
        const { reviewedBy } = approved;
        const blocked = async (reason: string, process?: CommandReceipt["process"]) => {
          const receipt = await settle({ decision: "allowed", reviewedBy, result: "blocked", reason, process });
          return receipt.ok ? failure("restore-blocked", `${reason} 应用回执 ${receipt.value}。`) : receipt;
        };
        const release = acquireProjectGitCriticalSection(projectRoot, effectKey);
        try {
          if (!release) return await blocked("当前项目 Git 临界区已有其他操作。");
          const beforeExec = await verifyAcceptanceEnvironment(projectRoot, basis, missing, installOptions);
          const refreshed = await preflightOwner(projectRoot, child.roleId);
          if (!beforeExec.ok || !beforeExec.value || beforeExec.value.present || beforeExec.value.projectInstallationExists !== privateInstall
            || !sameAcceptanceEnvironmentGit(before.git, beforeExec.value.git)
            || !refreshed.ok || reviewedBy.length === 0 || approved.cwd !== npm.cwd || JSON.stringify(approved.argv) !== JSON.stringify(npm.argv)
            || approved.roleId !== call.roleId || approved.turnId !== call.turnId || approved.toolCallId !== call.toolCallId
            || !sameAcceptanceReviewScope(approved.acceptanceEnvironmentScope, acceptanceEnvironmentScope)
            || !scopedCurrent() || !approved.isCurrent() || executionSignal?.aborted) return await blocked("审批后候选、标准、工作树、归属或原回合已变化。");
          const process = await npm.execute(executionSignal);
          if (process.status !== "exited" || !process.pid) return await blocked("应用未取得正常的 npm 进程退出结果。", process);
          const afterExec = await verifyAcceptanceEnvironment(projectRoot, basis, missing, installOptions);
          if (!afterExec.ok || !afterExec.value || afterExec.value.present || afterExec.value.projectInstallationExists !== privateInstall
            || !sameAcceptanceEnvironmentGit(before.git, afterExec.value.git)
            || !scopedCurrent() || !approved.isCurrent()) return await blocked("执行后候选、依据、目标或原回合无法再次核对。", process);
          if (process.exitCode !== 0) {
            const reason = process.transientNetworkFailure ? `公共 npm 源短暂连接失败（${process.npmErrorCode}），仍缺本地依赖。`
              : process.npmErrorCode === "ENOTFOUND" ? "无法解析获批公共 npm 源的域名（ENOTFOUND）。"
              : `npm 安装实际退出状态 ${process.exitCode ?? "异常"}${process.npmErrorCode ? `（${process.npmErrorCode}）` : ""}。`;
            const saved = await settle({ decision: "allowed", reviewedBy, process, result: process.transientNetworkFailure ? "retryable" : "blocked", reason, git: afterExec.value.git });
            return saved.ok ? failure("restore-process", `${reason} 应用回执 ${saved.value}。`) : saved;
          }
          const stillBound = () => scopedCurrent() && !executionSignal?.aborted;
          const directory = acceptanceEnvironmentScope.publishDirectory;
          const publishedIdentity = await npm.publish({ directory, ...(privateInstall ? { privateTaskId: child.taskId, parentIdentity: publishIdentity } : {}) },
            () => stillBound() && approved.isCurrent(), stillBound);
          const installed = await verifyAcceptanceEnvironment(projectRoot, basis, missing, installOptions);
          if (!installed.ok || !installed.value?.present || !sameAcceptanceEnvironmentGit(before.git, installed.value.git)) {
            return await blocked("npm 已退出，但本地执行入口或工作树未通过复核。", process);
          }
          const reason = "确已安装并独立核验本地执行入口。";
          const dependenciesSha256 = await inspectAcceptanceDependencies(installParent).catch(() => undefined);
          if (!dependenciesSha256 || !sameIdentity(publishedIdentity, installIdentity(directory)) || !stillBound()) {
            return await blocked("安装进程已退出，但发布目录的完整依赖字节或任务身份无法核验。", process);
          }
          const receipt = await settle({ decision: "allowed", reviewedBy, process, result: "installed", reason, git: installed.value.git,
            dependenciesSha256, ...(privateInstall ? { dependenciesLocation: { path: directory, identity: publishedIdentity } } : {}) });
          return receipt.ok ? { ok: true, value: { message: `${reason} 请正式回交应用回执 ${receipt.value}。`, execution: { exitCode: 0 } } } : receipt;
        } catch {
          return await blocked("应用未能安全完成或核验隔离安装，需保留现场核对。");
        } finally {
          release?.();
          await dispose();
        }
      },
    } };
  };
}

export const recoveryWakeKey = (child: DurablePendingTask): string => `environment-recovery-wake:${child.taskId}:${child.report?.key ?? ""}`;

/** Rebuild the existing desktop task journal from authoritative recovery facts after a restart. */
export async function mirrorAcceptanceEnvironmentClosures(store: Store, view: DurableProjection): Promise<void> {
  const events = store.listCapabilityEvents(view.ref).filter(row => row.receipt.state === "consumed" &&
    (row.event.input.kind === "environment-missing" || row.event.input.kind === "environment-recovery-settled"));
  if (!events.length) return;
  const journal = await readTaskState(view.projectRoot);
  for (const { event } of events) {
    const { input } = event;
    const tasks = input.kind === "environment-missing" ? [{ task: input.missing.basis.assessmentTask, outcome: "rejected" as const }]
      : input.kind === "environment-recovery-settled" ? [
        { task: input.settlement.parentTask, outcome: input.settlement.outcome.kind === "restored" ? "accepted" as const : "rejected" as const },
        { task: input.settlement.childTask, outcome: input.settlement.outcome.kind === "restored" ? "accepted" as const
          : input.settlement.outcome.kind === "retryable" ? "rework" as const : "rejected" as const },
      ] : [];
    for (const { task, outcome } of tasks) {
      const record = task && journal.records.get(task.taskId);
      if (!task || record?.closed || record?.created?.workflowId !== view.ref.instanceId || record.created.to !== task.roleId) continue;
      await appendTaskEvent(view.projectRoot, taskEvent("task.closed", { taskId: task.taskId, by: "convener", outcome,
        note: "应用依据持久验收环境事实收口当前任务。" }));
    }
  }
}

export function closeAcceptanceEnvironmentChild(
  durable: DesktopDurableWorkflow, session: () => LiveSession | undefined, preflightOwner: PreflightEnvironmentOwner,
): FixedCloseCreatedTaskFn {
  const get = graphTurn(durable, session);
  return async (input, signal) => {
    const live = await get();
    const view = live?.view;
    const env = view?.acceptanceEnvironment;
    if (!live || !view || !env?.basis || !env.missing || !env.effectKey || !env.parentTask || !env.childTask
      || env.parentTask.taskId !== live.entry.assignedTaskId || env.parentTask.taskId !== live.delivery.intent.task?.taskId
      || env.parentTask.roleId !== "convener" || env.parentTask.roleId !== live.source.roleId || env.childTask.taskId !== input.taskId) {
      return failure("close-turn", "恢复收口需要本次实际运营回合及原属主回交。");
    }
    const { ref, projectRoot } = view;
    const { basis, missing, parentTask, childTask } = env;
    const store = await durable.store();
    const child = acceptanceEnvironmentTask(view, childTask.roleId, childTask.taskId, "child");
    if (!child?.report || child.state !== "reported" || live.delivery.intent.key !== `model:${recoveryWakeKey(child)}`) {
      return failure("close-report", "本次恢复子任务缺少原始角色报告及应用核对回合。");
    }
    const snapshot = store.getEvidence(ref, child.report.evidence) as { handback?: TaskHandback } | undefined;
    if (snapshot?.handback?.taskId !== child.taskId || snapshot.handback.roleId !== child.roleId) {
      return failure("close-report", "恢复子任务回交来源无法核验。");
    }
    const receipt = installReceipt(store, view, child);
    let outcome: Parameters<Store["settleAcceptanceEnvironment"]>[1]["outcome"] = {
      kind: "blocked", reason: "本次任务未形成可核验的批准、进程退出和安装回执，作用需要核对。",
    };
    let disposition: TaskClosedOutcome = "rejected";
    if (receipt && receipt.details.result === "blocked") {
      outcome = { kind: "blocked", reason: receipt.details.reason, commandReceiptId: receipt.id };
    } else if (receipt?.details.decision === "allowed" && receipt.details.process?.status === "exited" && receipt.details.process.pid
      && receipt.details.turnId === snapshot.handback.turnId && receipt.details.git) {
      const release = acquireProjectGitCriticalSection(projectRoot, `verification:${env.effectKey}`);
      if (!release) return failure("close-busy", "当前项目 Git 临界区已有其他操作。");
      try {
        const owner = await preflightOwner(projectRoot, child.roleId);
        const privateInstall = missing.installTarget === "assessment-private";
        const privateParent = privateInstall ? acceptanceDependencyParent(projectRoot, child.taskId) : undefined;
        const verified = await verifyAcceptanceEnvironment(projectRoot, basis, missing, privateParent ? { privateParent } : undefined);
        const details = receipt.details;
        const location = details.dependenciesLocation;
        const privateProof = !privateInstall || !!(privateParent && location?.path === path.join(privateParent, "node_modules")
          && details.acceptanceEnvironmentScope?.publishDirectory === location.path
          && sameIdentity(details.acceptanceEnvironmentScope.publishIdentity, installIdentity(privateParent))
          && sameIdentity(location.identity, installIdentity(location.path))
          && details.dependenciesSha256 === await inspectAcceptanceDependencies(privateParent).catch(() => undefined)
          && details.dependenciesSha256 && sameIdentity(location.identity, installIdentity(location.path)));
        if (owner.ok && verified.ok && verified.value && sameAcceptanceEnvironmentGit(receipt.details.git, verified.value.git)) {
          if (receipt.details.result === "installed" && receipt.details.process.exitCode === 0
            && snapshot.handback.status === "completed" && verified.value.present && privateProof) {
            const verification = store.storeEvidence(ref, { kind: "npm-local-executable-verified", candidateOid: basis.candidateOid,
              criteria: basis.criteria, manifest: missing.manifest, ...(missing.lock ? { lock: missing.lock } : {}),
              taskId: child.taskId, commandReceiptId: receipt.id, executable: missing.condition.executable, git: verified.value.git,
              ...(privateInstall ? { dependenciesLocation: location, dependenciesSha256: details.dependenciesSha256 } : {}) });
            if (!verification.ok) return verification;
            outcome = { kind: "restored", commandReceiptId: receipt.id, verification: verification.value };
            disposition = "accepted";
          } else if (receipt.details.result === "retryable" && receipt.details.process.transientNetworkFailure
            && snapshot.handback.status === "blocked" && !verified.value.present) {
            outcome = { kind: "retryable", reason: receipt.details.reason, commandReceiptId: receipt.id };
            disposition = "rework";
          }
        } else {
          outcome = { kind: "blocked", reason: !owner.ok ? owner.message : !verified.ok ? verified.message : "候选工作树在安装后已经变化。", commandReceiptId: receipt.id };
        }
      } finally {
        release();
      }
    }
    if (input.outcome !== disposition) return failure("close-outcome", `应用实物核对结果为 ${disposition}。请按该结果处置当前子任务。`);
    const current = () => !signal?.aborted && live.current() && store.lookup(ref)?.acceptanceEnvironment?.effectKey === env.effectKey;
    if (!current()) return failure("close-turn", "运营回合已结束，原核对不能用于当前任务。");
    const saved = await store.settleAcceptanceEnvironment(ref, { parentTask, childTask, originId: live.source.originId, outcome }, current);
    if (!saved.ok) return saved;
    if (saved.value.state === "ignored") return failure("close-stale", saved.value.reason ?? "当前恢复作用已变化。");
    await mirrorAcceptanceEnvironmentClosures(store, view);
    durable.activate();
    return { ok: true, taskId: child.taskId, outcome: disposition, workflowId: ref.instanceId, stage: "A12b",
      operationId: input.operationId, eventId: `${saved.value.key}:${child.taskId}`, replay: false, stageCompleted: false };
  };
}
