// app/desktop/runtime-resolution.ts
// 自动验收派发 / 冷启动补齐检查的**引擎选择解析器**（纯逻辑，可按依赖注入测试；不依赖 electron）。
//
// 2026-10-19 真机缺陷：应用冷启动 / 导入项目时触发自动验收派发，但没有活跃会话 ⇒ 旧代码回退桌面默认
// `"claude"`，而项目实际使用 Pi ⇒ `acceptance.send.failed: Claude SDK 运行失败：Claude 缺少 API key：
// ANTHROPIC_API_KEY`。客户要求「不用客户手动触发」⇒ 自动派发必须**选对引擎**。
//
// 解析优先级（逐级只读；每一级候选都须有**当前可用的凭据**，否则如实跳过并继续下一级）：
//   1. 该项目当前活跃会话的 runtime（调用方只读视图：真实会话事件 / 活动会话 / 最近治理会话）；
//   2. 应用内已选 / 持久化的 per-project runtime（本模块提供最小持久化，写 user-data 的独立 JSON；
//      **不碰治理账本、不写项目 `.ans`**）；
//   3. 项目磁盘证据：`.ans/sessions/<roleId>/<runtime>/` 中最近使用/存在的 runtime（pi/codex/claude）；
//   4. 配置可用性检测：读应用实际 `.env`/环境，凭据齐全的引擎才可选（Claude 需 ANTHROPIC_API_KEY，
//      Codex 需 CODEX_API_KEY 或 OPENAI_API_KEY，Pi 需 ANTHROPIC_AUTH_TOKEN + ANS_PI_BASE_URL +
//      ANS_PI_MODEL——键集**单一来源**是共享注册表 `runtime-settings.ts`，经 `getRuntimeConfig` 消费）；
//   5. 仍无法确定 ⇒ 返回明确失败（调用方不派发、落系统行/诊断、不循环重试）——**绝不在无凭据时默认 claude**。
//
// 凭据判定复用 `runtime-config.ts::getRuntimeConfig`（共享注册表 + 共享 `.env` 读取器），本模块不复制
// 第二份键集/`.env` 解析。

import { readdir, readFile, stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "../../src/common/shared/atomic-write.ts";
import type { EnvTarget } from "../../src/common/shared/env-file.ts";
import type { RuntimeKind } from "../../src/common/shared/runtime-shared.ts";
import { getRuntimeConfig } from "./runtime-config.ts";

/** 自动派发只考虑真实引擎；`demo` 是聊天演示引擎，不参与自动验收/冷启动派发。 */
export const AUTO_RUNTIME_CANDIDATES = ["pi", "codex", "claude"] as const;
export type AutoRuntimeKind = (typeof AUTO_RUNTIME_CANDIDATES)[number];

/** 无法确定引擎时的固定用户可见文案（系统行与诊断共用，避免两处措辞漂移）。 */
export const RUNTIME_UNRESOLVED_MESSAGE =
  "无法确定项目引擎，请先选择引擎；本次自动验收派发已跳过（不会循环重试）。";

/** 解析成功的来源（用于诊断/测试；不参与派发语义）。 */
export type RuntimeResolutionSource = "active-session" | "selected" | "persisted" | "session-history" | "credentials";

/** 被跳过的候选事实（不含任何凭据值；供诊断与测试断言）。 */
export interface RuntimeCandidateSkip {
  runtime: RuntimeKind;
  reason: "not-auto-runtime" | "missing-credentials";
}

export interface RuntimeResolutionSuccess {
  ok: true;
  runtime: AutoRuntimeKind;
  source: RuntimeResolutionSource;
  skipped: RuntimeCandidateSkip[];
}

export interface RuntimeResolutionFailure {
  ok: false;
  message: typeof RUNTIME_UNRESOLVED_MESSAGE;
  skipped: RuntimeCandidateSkip[];
}

export type RuntimeResolution = RuntimeResolutionSuccess | RuntimeResolutionFailure;

/** 解析请求：优先级 1/2 的候选由调用方只读提供；3/4 级由本模块读盘/读配置完成。 */
export interface RuntimeResolutionRequest {
  projectRoot: string;
  /** 优先级 1：当前活跃会话的 runtime（真实事件/活动会话；`demo` 会被如实跳过）。 */
  activeRuntime?: RuntimeKind;
  /** 优先级 2：应用内最近一次治理会话的 runtime（本进程内存）。 */
  selectedRuntime?: RuntimeKind;
  /** 优先级 2：持久化的 per-project 选择（见 `readPersistedProjectRuntime`）。 */
  persistedRuntime?: RuntimeKind;
}

export interface ResolveProjectRuntimeInput extends RuntimeResolutionRequest {
  /** 应用实际读取的配置文件（开发＝仓库根 `.env`；安装包＝userData/.env）。 */
  envPath: string;
  /** 环境目标（缺省 `process.env`；测试注入假对象以隔离真实进程环境）。 */
  env?: EnvTarget;
}

export function isAutoRuntimeKind(value: unknown): value is AutoRuntimeKind {
  return typeof value === "string" && (AUTO_RUNTIME_CANDIDATES as readonly string[]).includes(value);
}

/**
 * 该引擎当前凭据是否齐全。**单一来源**：共享注册表的必填键 + 共享 `.env` 读取链（`getRuntimeConfig`）。
 * 读取失败（`.env` 不可读等）⇒ 不可用（fail-closed：不因读不到配置而猜一个引擎）。
 */
export async function runtimeCredentialsAvailable(
  runtime: AutoRuntimeKind,
  options: { envPath: string; env?: EnvTarget },
): Promise<boolean> {
  try {
    const view = await getRuntimeConfig(runtime, { envPath: options.envPath, env: options.env });
    return view.missingKeys.length === 0;
  } catch {
    return false;
  }
}

// —————————————— 优先级 3：项目磁盘会话证据 ——————————————

/** 单个引擎的会话目录证据。 */
export interface RuntimeSessionEvidence {
  runtime: AutoRuntimeKind;
  /** 该引擎所有 `<role>/<runtime>/` 目录内最新的文件/目录 mtime；无可用 stat ⇒ 0。 */
  latestMtimeMs: number;
  /** 出现过该引擎目录的角色数（主判据是 mtime，此值只做同刻 tie-break）。 */
  roleCount: number;
}

/**
 * 会话目录的**有界**遍历预算（每个 `<runtime>` 目录共享）：真机 `.ans/sessions/<role>/<runtime>/`
 * 下有 `ans/`（index.json/replay.jsonl）与 `native/`（逐轮 jsonl）两层，最多几百个文件；上限保证
 * 冷启动补齐检查不会因历史目录过大而拖住事件循环。预算耗尽只影响「最近使用」精度，不影响可判定性。
 */
const EVIDENCE_MAX_ENTRIES_PER_RUNTIME = 400;
const EVIDENCE_MAX_DEPTH = 3;

async function newestMtimeMs(root: string): Promise<number | undefined> {
  let newest: number | undefined;
  let budget = EVIDENCE_MAX_ENTRIES_PER_RUNTIME;
  const rootStat = await stat(root).catch(() => undefined);
  if (rootStat === undefined) return undefined;
  newest = rootStat.mtimeMs;
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (budget <= 0 || depth > EVIDENCE_MAX_DEPTH) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => undefined);
    if (entries === undefined) return;
    for (const entry of entries) {
      if (budget <= 0) return;
      budget -= 1;
      const full = path.join(dir, entry.name);
      const info = await stat(full).catch(() => undefined);
      if (info !== undefined && info.mtimeMs > (newest ?? 0)) newest = info.mtimeMs;
      if (entry.isDirectory()) await walk(full, depth + 1);
    }
  };
  await walk(root, 0);
  return newest;
}

/**
 * 读 `<projectRoot>/.ans/sessions/<roleId>/<runtime>/`（pi/codex/claude）：每个引擎取
 * **最近使用**（目录内最新 mtime）为主、出现角色数为次；返回按优先级排序的证据列表。
 * 只读、缺失/不可读目录 ⇒ 空列表（不抛错、不建目录）。
 */
export async function inferRuntimeFromSessionDirectories(projectRoot: string): Promise<RuntimeSessionEvidence[]> {
  if (typeof projectRoot !== "string" || projectRoot.trim() === "") return [];
  const sessionsRoot = path.join(projectRoot, ".ans", "sessions");
  const roleEntries = await readdir(sessionsRoot, { withFileTypes: true }).catch(() => undefined);
  if (roleEntries === undefined) return [];
  const collected = new Map<AutoRuntimeKind, { latestMtimeMs: number; roleCount: number }>();
  for (const roleEntry of roleEntries) {
    if (!roleEntry.isDirectory()) continue;
    const roleDir = path.join(sessionsRoot, roleEntry.name);
    const inner = await readdir(roleDir, { withFileTypes: true }).catch(() => undefined);
    if (inner === undefined) continue;
    for (const entry of inner) {
      if (!entry.isDirectory() || !isAutoRuntimeKind(entry.name)) continue;
      const runtime: AutoRuntimeKind = entry.name;
      const latest = await newestMtimeMs(path.join(roleDir, runtime));
      const current = collected.get(runtime) ?? { latestMtimeMs: 0, roleCount: 0 };
      current.roleCount += 1;
      if (latest !== undefined && latest > current.latestMtimeMs) current.latestMtimeMs = latest;
      collected.set(runtime, current);
    }
  }
  return [...collected.entries()]
    .map(([runtime, value]) => ({ runtime, ...value }))
    .sort(
      (a, b) =>
        b.latestMtimeMs - a.latestMtimeMs ||
        b.roleCount - a.roleCount ||
        AUTO_RUNTIME_CANDIDATES.indexOf(a.runtime) - AUTO_RUNTIME_CANDIDATES.indexOf(b.runtime),
    );
}

// —————————————— 优先级 2：per-project 持久化（user-data 独立 JSON，不碰治理账本） ——————————————

/** 持久化文件格式（最小；未知版本/坏件一律按「无持久化」处理）。 */
export interface PersistedRuntimeStateFile {
  version: 1;
  projects: Record<string, { runtime: AutoRuntimeKind; updatedAt: string }>;
}

/** 保留的项目条目上限（LRU：按 updatedAt 保留最新 N 个，防文件无界增长）。 */
export const MAX_PERSISTED_PROJECTS = 200;

/** 读持久化的 per-project 选择；文件缺失/坏件/版本不符/值非法 ⇒ `undefined`（不抛错）。 */
export async function readPersistedProjectRuntime(
  statePath: string | undefined,
  projectRoot: string,
): Promise<RuntimeKind | undefined> {
  if (typeof statePath !== "string" || statePath === "" || typeof projectRoot !== "string" || projectRoot === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(statePath, "utf8"));
  } catch {
    return undefined;
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const file = parsed as Partial<PersistedRuntimeStateFile>;
  if (file.version !== 1 || !file.projects || typeof file.projects !== "object") return undefined;
  const entry = file.projects[projectRoot];
  if (!entry || typeof entry !== "object" || !isAutoRuntimeKind(entry.runtime)) return undefined;
  return entry.runtime;
}

/**
 * 记录一次成功的引擎选择（覆盖同项目旧值）。`statePath` 缺省 ⇒ 持久化关闭（no-op，视为成功）。
 * 原子写（同目录 temp + rename，0600）；失败如实返回错误文本（**不含凭据**），由调用方只记诊断。
 */
export async function persistProjectRuntime(
  statePath: string | undefined,
  projectRoot: string,
  runtime: RuntimeKind,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof statePath !== "string" || statePath === "") return { ok: true };
  if (typeof projectRoot !== "string" || projectRoot === "" || !isAutoRuntimeKind(runtime)) {
    return { ok: false, error: "持久化参数无效。" };
  }
  let projects: PersistedRuntimeStateFile["projects"] = {};
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf8")) as Partial<PersistedRuntimeStateFile>;
    if (parsed && parsed.version === 1 && parsed.projects && typeof parsed.projects === "object") {
      projects = parsed.projects as PersistedRuntimeStateFile["projects"];
    }
  } catch {
    // 缺失/坏件 ⇒ 从空表重建（坏件不阻塞持久化；下一次写入即修复）。
  }
  projects[projectRoot] = { runtime, updatedAt: new Date().toISOString() };
  const trimmed: PersistedRuntimeStateFile["projects"] = {};
  const ordered = Object.entries(projects)
    .sort((a, b) => {
      const at = Date.parse(a[1]?.updatedAt ?? "") || 0;
      const bt = Date.parse(b[1]?.updatedAt ?? "") || 0;
      return bt - at;
    })
    .slice(0, MAX_PERSISTED_PROJECTS);
  for (const [root, entry] of ordered) {
    if (entry && isAutoRuntimeKind(entry.runtime)) trimmed[root] = entry;
  }
  const payload: PersistedRuntimeStateFile = { version: 1, projects: trimmed };
  try {
    await mkdir(path.dirname(statePath), { recursive: true, mode: 0o700 });
    // 跨角色共享原子写原语（单一来源，含 Windows rename 瞬时 EPERM 有界重试）；0600，内容不含凭据。
    await atomicWrite(statePath, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
    return { ok: true };
  } catch {
    return { ok: false, error: "引擎选择未能写入持久化文件。" };
  }
}

// —————————————— 解析主流程 ——————————————

/**
 * 按优先级解析项目引擎。纯读（除 `getRuntimeConfig` 读 `.env` 与磁盘会话目录 stat 外无副作用）。
 * 每一级候选都必须通过凭据可用性检测；全部失败 ⇒ `{ok:false}` + 固定文案（调用方不派发、不重试）。
 */
export async function resolveProjectRuntime(input: ResolveProjectRuntimeInput): Promise<RuntimeResolution> {
  const skipped: RuntimeCandidateSkip[] = [];
  const seen = new Set<RuntimeKind>();
  const credentialOptions = {
    envPath: input.envPath,
    ...(input.env !== undefined ? { env: input.env } : {}),
  };

  const consider = async (
    runtime: RuntimeKind | undefined,
    source: RuntimeResolutionSource,
  ): Promise<RuntimeResolutionSuccess | undefined> => {
    if (runtime === undefined || seen.has(runtime)) return undefined;
    seen.add(runtime);
    if (!isAutoRuntimeKind(runtime)) {
      skipped.push({ runtime, reason: "not-auto-runtime" });
      return undefined;
    }
    if (await runtimeCredentialsAvailable(runtime, credentialOptions)) {
      return { ok: true, runtime, source, skipped };
    }
    skipped.push({ runtime, reason: "missing-credentials" });
    return undefined;
  };

  // 1. 当前活跃会话（真实事件/活动会话）。
  const fromActive = await consider(input.activeRuntime, "active-session");
  if (fromActive !== undefined) return fromActive;
  // 2. 应用内已选（本进程最近治理会话）→ 持久化 per-project 选择。
  const fromSelected = await consider(input.selectedRuntime, "selected");
  if (fromSelected !== undefined) return fromSelected;
  const fromPersisted = await consider(input.persistedRuntime, "persisted");
  if (fromPersisted !== undefined) return fromPersisted;
  // 3. 项目磁盘会话证据（最近使用/存在）。
  for (const evidence of await inferRuntimeFromSessionDirectories(input.projectRoot)) {
    const fromHistory = await consider(evidence.runtime, "session-history");
    if (fromHistory !== undefined) return fromHistory;
  }
  // 4. 配置可用性：只从凭据齐全的引擎里选（确定顺序 pi → codex → claude；**绝不无凭据默认 claude**）。
  for (const runtime of AUTO_RUNTIME_CANDIDATES) {
    if (seen.has(runtime)) continue;
    seen.add(runtime);
    if (await runtimeCredentialsAvailable(runtime, credentialOptions)) {
      return { ok: true, runtime, source: "credentials", skipped };
    }
    skipped.push({ runtime, reason: "missing-credentials" });
  }
  // 5. 仍无法确定：明确失败（不派发、不循环重试）。
  return { ok: false, message: RUNTIME_UNRESOLVED_MESSAGE, skipped };
}
