// test/桌面应用/runtime-resolution.test.ts
// 2026-10-19 真机缺陷（自动验收派发）：冷启动/导入项目时没有活跃会话，旧代码回退桌面默认 `"claude"`，
// 而项目实际使用 Pi ⇒ `acceptance.send.failed: Claude SDK 运行失败：Claude 缺少 API key：
// ANTHROPIC_API_KEY`。客户要求「不用客户手动触发」⇒ 自动派发必须选对引擎。
//
// 本文件钉住（① 解析器纯逻辑；② Interface 接线）：
//   1. 活跃会话 runtime 优先；
//   2. 应用内已选（本进程最近治理会话）→ 持久化 per-project runtime 次之；
//   3. `.ans/sessions/<role>/<runtime>/` 磁盘证据（最近使用/存在）再次之；
//   4. 配置可用性：仅 Pi 凭据齐全 ⇒ pi；仅 Codex ⇒ codex；Claude 需 ANTHROPIC_API_KEY；
//      磁盘/活动会话指向 Claude 但无 key ⇒ 跳过，绝不选 Claude；
//   5. 仍无法确定 ⇒ 不派发 + 一条明确系统行（「无法确定项目引擎，请先选择引擎」）+ 不写派发记录；
//      客户之后选定引擎的真实事件可以再检查一次（不永久锁死、也不循环重试）；
//   6. 成功派发后把所选 runtime 写入持久化位置；客户 openSession 成功也记住该选择。

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { rm as removeAsync } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  RUNTIME_UNRESOLVED_MESSAGE,
  inferRuntimeFromSessionDirectories,
  persistProjectRuntime,
  readPersistedProjectRuntime,
  resolveProjectRuntime,
  type RuntimeResolution,
  type RuntimeResolutionRequest,
} from "../../app/desktop/runtime-resolution.ts";
import { createDesktopInterface } from "../../app/desktop/interface.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { readGovernanceLedger, appendGovernanceLedger, type GovernanceLedgerEntry } from "../../src/pipeline/orchestration/govern-session.ts";
import type { SessionEventEnvelope, RuntimeKind } from "../../app/desktop/session.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { SessionEvent } from "../../src/provider/pi/session.ts";

// ————————————————— 夹具 —————————————————

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

/**
 * 删除测试临时目录，带**有界重试**：`stopSession()` 返回后仍可能有异步写入终于落盘，
 * 2026-10-20 CI run 39389502551（macOS arm64）因此在 teardown 的 `rmSync` 抛 ENOTEMPTY。
 * 只对 ENOTEMPTY/EBUSY/EPERM（目录仍在写/被占用）重试，最多 10 次、间隔 75ms，末次仍失败才抛；
 * 其它错误立即上抛，不掩盖产品错误。用异步 rm + 异步退避（不阻塞事件循环），让待完成的写入有机会收尾。
 */
async function removeTempDirEventually(dir: string, attempts = 10, delayMs = 75): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await removeAsync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return; // force 已吞掉，兜底并发删除
      if (code !== "ENOTEMPTY" && code !== "EBUSY" && code !== "EPERM") throw error;
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(
    `清理临时目录失败（已重试 ${attempts} 次）：${dir}${lastError instanceof Error ? `：${lastError.message}` : ""}`,
    { cause: lastError },
  );
}

const PI_KEYS = {
  ANTHROPIC_AUTH_TOKEN: "test-pi-token",
  ANS_PI_BASE_URL: "https://pi.example.invalid",
  ANS_PI_MODEL: "test-pi-model",
};
const CODEX_KEYS = { CODEX_API_KEY: "test-codex-key", ANS_CODEX_MODEL: "test-codex-model" };
const CLAUDE_KEYS = { ANTHROPIC_API_KEY: "test-claude-key" };

function writeEnvFile(dir: string, entries: Record<string, string>): string {
  const envPath = path.join(dir, ".env");
  writeFileSync(envPath, Object.entries(entries).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  return envPath;
}

/** 把一棵目录树（含自身）的 mtime 统一拨到指定时刻（秒级 utimes；用于构造「最近使用」证据）。 */
function ageTree(target: string, atMs: number): void {
  const seconds = atMs / 1000;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) ageTree(full, atMs);
    utimesSync(full, seconds, seconds);
  }
  utimesSync(target, seconds, seconds);
}

/** 构造 `.ans/sessions/<roleId>/<runtime>/` 的真实磁盘形状（与适配器一致：ans/ 下 replay/index）。 */
function seedSessionDir(projectRoot: string, roleId: string, runtime: string, atMs: number): void {
  const dir = path.join(projectRoot, ".ans", "sessions", roleId, runtime);
  mkdirSync(path.join(dir, "ans"), { recursive: true });
  writeFileSync(path.join(dir, "ans", "replay.jsonl"), "{}\n");
  ageTree(dir, atMs);
}

function trioListing(roleIds: string[] = ["rapporteur", "nominator", "convener", "verifier"]): ProjectListing {
  const role = (roleId: string) => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: `# ${roleId}`,
    boundary: { entries: [], boundarySource: "<built-in>", acceptance: { accepted: false, source: "" } },
    builtIn: true,
    ...(roleId === "rapporteur"
      ? { governanceFunction: "proposal" as const }
      : roleId === "nominator"
        ? { governanceFunction: "nomination" as const }
        : roleId === "verifier"
          ? { governanceFunction: "verification" as const }
          : { governanceFunction: "schedule" as const }),
  });
  return {
    projectRoot: "/proj",
    roles: roleIds.map(role),
    warnings: [],
    hasRoles: false,
    // 2026-10-19 客户决定：自动验收门反馈统一发给 Lead（主入口）；真实 trio 的 primaryRoleId=liaison。
    primaryRoleId: "liaison",
    governanceModel: "trio",
  };
}

function listingWithProjectRoles(base: ProjectListing, roleIds: string[]): ProjectListing {
  return {
    ...base,
    hasRoles: true,
    roles: [
      ...base.roles,
      ...roleIds.map((roleId) => ({
        roleId,
        cardPath: `角色卡/${roleId}/role-card.md`,
        boundaryPath: `角色卡/${roleId}/boundary.yaml`,
        cardText: `# ${roleId}`,
        boundary: {
          entries: [],
          boundarySource: `角色卡/${roleId}/boundary.yaml`,
          acceptance: { accepted: false, source: "" },
        },
      })),
    ],
  };
}

function writeFlowFile(projectRoot: string, flowId: string, yaml: string): void {
  mkdirSync(path.join(projectRoot, "docs", "flows"), { recursive: true });
  writeFileSync(path.join(projectRoot, "docs", "flows", `${flowId}.yaml`), yaml);
}

async function seedGovernanceEvidence(projectRoot: string, flowId: string): Promise<void> {
  const entries: Array<Omit<GovernanceLedgerEntry, "at">> = [
    {
      kind: "customer.decision",
      flowId,
      stepId: "nomination",
      decisionKind: "appointment",
      customerDecision: "appointed",
      actorRoleId: "nominator",
      power: "nomination",
      targetRoleIds: ["executor"],
    },
    { kind: "artifact.observed", artifactPath: `docs/contracts/${flowId}-api-v1.md`, actorRoleId: "rapporteur", power: "proposal" },
    { kind: "dispatch.accepted", flowId, stepId: "delivery-server", actorRoleId: "convener", power: "schedule", targetRoleId: "executor" },
  ];
  for (const entry of entries) {
    const appended = await appendGovernanceLedger(projectRoot, { at: new Date().toISOString(), ...entry });
    assert.equal(appended.ok, true, appended.ok ? "" : appended.message);
  }
}

function acceptanceFlow(flowId: string): string {
  // 2026-10-24 客户修订：`release` 仅保留为既有元数据（不再作为独立验收门）；本文件只测引擎解析/派发接线，
  // 夹具保留 release: true 以覆盖该字段的解析。证据形状与 `seedGovernanceEvidence` 的账本条目一一对应。
  return [
    `flowId: ${flowId}`,
    "version: 1",
    "qualityTier: production",
    "release: true",
    "steps:",
    "  - id: nomination",
    "    title: 步骤 nomination",
    "    owner: nominator",
    "    kind: customer-decision",
    "    status: done",
    "    evidence:",
    "      kind: customer-decision",
    "      ref: appointment",
    "  - id: contract-freeze",
    "    title: 步骤 contract-freeze",
    "    owner: rapporteur",
    "    kind: artifact",
    "    status: done",
    "    evidence:",
    "      kind: artifact",
    `      ref: docs/contracts/${flowId}-api-v1.md`,
    "  - id: delivery-server",
    "    title: 步骤 delivery-server",
    "    owner: executor",
    "    kind: dispatch",
    "    status: done",
    "    evidence:",
    "      kind: dispatch",
    "      ref: delivery-server",
    "  - id: verification",
    "    title: 验收",
    "    owner: app",
    "    kind: acceptance",
    "    status: pending",
    "",
  ].join("\n");
}

/** 可推任意事件（含 settled）的会话句柄（与既有 interface 测试同思路）。 */
function scriptedHandle(sends: string[]): {
  handle: RoleSessionHandle;
  emit: (event: SessionEvent) => void;
  settle: () => void;
} {
  const queue: SessionEvent[] = [];
  const handle: RoleSessionHandle = {
    async send(text: string): Promise<void> {
      sends.push(text);
    },
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              for (let i = 0; i < 400; i += 1) {
                const event = queue.shift();
                if (event !== undefined) return { value: event, done: false };
                await new Promise((resolve) => setTimeout(resolve, 5));
              }
              return { value: undefined as unknown as SessionEvent, done: true };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {},
  };
  return {
    handle,
    emit: (event) => {
      queue.push(event);
    },
    settle: () => {
      queue.push({ kind: "settled", summary: "一轮结束（测试替身）" } as SessionEvent);
    },
  };
}

async function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error("等待测试条件超时");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** 异步条件轮询（落盘/异步链在并发全量下可能晚于「发送已可见」一个事件循环窗口）。 */
async function waitForAsync(check: () => Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error("等待测试条件超时");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface HarnessOptions {
  listing: ProjectListing;
  resolveRuntimeFn?: (request: RuntimeResolutionRequest) => Promise<RuntimeResolution>;
  runtimeStatePath?: string;
  envFilePath?: string;
  piConfigEnv?: Record<string, string | undefined>;
}

interface OpenInputView {
  projectRoot: string;
  roleId: string;
  runtime?: RuntimeKind;
}

interface Harness {
  iface: ReturnType<typeof createDesktopInterface>;
  sendsByRole: Map<string, string[]>;
  events: SessionEventEnvelope[];
  controls: Map<string, ReturnType<typeof scriptedHandle>>;
  openInputs: OpenInputView[];
}

async function makeHarness(projectRoot: string, options: HarnessOptions): Promise<Harness> {
  const sendsByRole = new Map<string, string[]>();
  const events: SessionEventEnvelope[] = [];
  const controls = new Map<string, ReturnType<typeof scriptedHandle>>();
  const openInputs: OpenInputView[] = [];
  const iface = createDesktopInterface({
    pickDirectory: async () => projectRoot,
    emitEvent: (envelope) => {
      events.push(envelope);
    },
    listProjectFn: async () => options.listing,
    openRoleSessionFn: async (input) => {
      openInputs.push({
        projectRoot: input.project.projectRoot,
        roleId: input.roleId,
        ...(input.runtime !== undefined ? { runtime: input.runtime } : {}),
      });
      const sends: string[] = [];
      sendsByRole.set(input.roleId, sends);
      const made = scriptedHandle(sends);
      controls.set(input.roleId, made);
      return made.handle;
    },
    buildProjectConfigFn: buildProjectConfig,
    ...(options.resolveRuntimeFn !== undefined ? { resolveRuntimeFn: options.resolveRuntimeFn } : {}),
    ...(options.runtimeStatePath !== undefined ? { runtimeStatePath: options.runtimeStatePath } : {}),
    ...(options.envFilePath !== undefined ? { envFilePath: options.envFilePath } : {}),
    ...(options.piConfigEnv !== undefined ? { piConfigEnv: options.piConfigEnv } : {}),
  });
  await iface.listProject({ projectRoot });
  return { iface, sendsByRole, events, controls, openInputs };
}

function deliveryNotes(events: SessionEventEnvelope[], roleId: string): string[] {
  return events
    .filter(
      (envelope) =>
        envelope.roleId === roleId &&
        envelope.event.kind === "message" &&
        (envelope.event as { detail?: { source?: string } }).detail?.source === "delivery-note",
    )
    .map((envelope) => String((envelope.event as { summary?: string }).summary));
}

async function verifierDispatches(projectRoot: string, flowId: string): Promise<GovernanceLedgerEntry[]> {
  const ledger = await readGovernanceLedger(projectRoot);
  return ledger.entries.filter(
    (entry) =>
      entry.kind === "dispatch.accepted" &&
      entry.flowId === flowId &&
      entry.targetRoleId === "verifier" &&
      entry.stepId === "verification",
  );
}

// ————————————————— ① 解析器纯逻辑 —————————————————

test("解析优先级 1：活跃会话的 runtime 优先（高于已选/持久化/磁盘证据）", async () => {
  const root = makeTempDir("ans-runtime-active-");
  try {
    const envPath = writeEnvFile(root, { ...PI_KEYS, ...CODEX_KEYS, ...CLAUDE_KEYS });
    seedSessionDir(root, "role-a", "pi", Date.now() - 60_000);
    const result = await resolveProjectRuntime({
      projectRoot: root,
      activeRuntime: "codex",
      selectedRuntime: "claude",
      persistedRuntime: "claude",
      envPath,
      env: {},
    });
    assert.deepEqual(result, { ok: true, runtime: "codex", source: "active-session", skipped: [] });
  } finally {
    await removeTempDirEventually(root);
  }
});

test("解析优先级 2：应用内已选（本进程）先于持久化", async () => {
  const root = makeTempDir("ans-runtime-selected-");
  try {
    const envPath = writeEnvFile(root, { ...PI_KEYS, ...CODEX_KEYS });
    const result = await resolveProjectRuntime({
      projectRoot: root,
      selectedRuntime: "pi",
      persistedRuntime: "codex",
      envPath,
      env: {},
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.runtime, "pi");
      assert.equal(result.source, "selected");
    }
  } finally {
    await removeTempDirEventually(root);
  }
});

test("解析优先级 2：无活跃/已选时用持久化的 per-project runtime", async () => {
  const root = makeTempDir("ans-runtime-persisted-");
  try {
    const envPath = writeEnvFile(root, { ...PI_KEYS, ...CODEX_KEYS });
    seedSessionDir(root, "role-a", "pi", Date.now() - 60_000);
    const result = await resolveProjectRuntime({
      projectRoot: root,
      persistedRuntime: "codex",
      envPath,
      env: {},
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.runtime, "codex");
      assert.equal(result.source, "persisted");
    }
  } finally {
    await removeTempDirEventually(root);
  }
});

test("解析优先级 3：`.ans/sessions/<role>/<runtime>/` 取最近使用；仅存在单一引擎时也能判定", async () => {
  const root = makeTempDir("ans-runtime-history-");
  try {
    const envPath = writeEnvFile(root, { ...PI_KEYS, ...CODEX_KEYS, ...CLAUDE_KEYS });
    const now = Date.now();
    seedSessionDir(root, "role-a", "pi", now - 120_000);
    seedSessionDir(root, "role-b", "claude", now - 60_000);
    const evidence = await inferRuntimeFromSessionDirectories(root);
    assert.deepEqual(evidence.map((item) => item.runtime), ["claude", "pi"], "最近使用的 claude 排在 pi 前");

    const recent = await resolveProjectRuntime({ projectRoot: root, envPath, env: {} });
    assert.equal(recent.ok, true);
    if (recent.ok) {
      assert.equal(recent.runtime, "claude");
      assert.equal(recent.source, "session-history");
    }

    // 只有 pi 目录（另一 runtime 目录不存在）⇒ 直接按存在证据判定。
    rmSync(path.join(root, ".ans", "sessions", "role-b"), { recursive: true, force: true });
    const onlyPi = await resolveProjectRuntime({ projectRoot: root, envPath, env: {} });
    assert.equal(onlyPi.ok, true);
    if (onlyPi.ok) {
      assert.equal(onlyPi.runtime, "pi");
      assert.equal(onlyPi.source, "session-history");
    }
  } finally {
    await removeTempDirEventually(root);
  }
});

test("解析优先级 4：仅 Pi 配置 ⇒ pi；仅 Codex 配置 ⇒ codex；仅 Claude 配置 ⇒ claude", async () => {
  const root = makeTempDir("ans-runtime-credentials-");
  try {
    const piPath = writeEnvFile(root, PI_KEYS);
    const piResult = await resolveProjectRuntime({ projectRoot: root, envPath: piPath, env: {} });
    assert.equal(piResult.ok, true);
    if (piResult.ok) {
      assert.equal(piResult.runtime, "pi");
      assert.equal(piResult.source, "credentials");
    }

    const codexPath = writeEnvFile(root, CODEX_KEYS);
    const codexResult = await resolveProjectRuntime({ projectRoot: root, envPath: codexPath, env: {} });
    assert.equal(codexResult.ok, true);
    if (codexResult.ok) {
      assert.equal(codexResult.runtime, "codex");
      assert.equal(codexResult.source, "credentials");
    }

    const claudePath = writeEnvFile(root, CLAUDE_KEYS);
    const claudeResult = await resolveProjectRuntime({ projectRoot: root, envPath: claudePath, env: {} });
    assert.equal(claudeResult.ok, true);
    if (claudeResult.ok) {
      assert.equal(claudeResult.runtime, "claude");
      assert.equal(claudeResult.source, "credentials");
    }
  } finally {
    await removeTempDirEventually(root);
  }
});

test("无 Claude key 时不选 Claude：活跃会话/磁盘证据指向 claude 也跳到有凭据的 Pi", async () => {
  const root = makeTempDir("ans-runtime-no-claude-");
  try {
    const envPath = writeEnvFile(root, PI_KEYS);
    seedSessionDir(root, "verifier", "claude", Date.now());
    const result = await resolveProjectRuntime({
      projectRoot: root,
      activeRuntime: "claude",
      persistedRuntime: "claude",
      envPath,
      env: {},
    });
    assert.equal(result.ok, true, "有可用 Pi 凭据 ⇒ 选 pi，而不是无凭据的 claude");
    if (result.ok) {
      assert.equal(result.runtime, "pi");
      assert.equal(result.source, "credentials");
      assert.ok(
        result.skipped.some((item) => item.runtime === "claude" && item.reason === "missing-credentials"),
        "claude 因缺 ANTHROPIC_API_KEY 被如实跳过",
      );
    }
    // 只有 claude 磁盘证据、且无任何凭据 ⇒ 明确失败（不默认 claude）。
    const emptyDir = makeTempDir("ans-runtime-empty-env-");
    try {
      const emptyPath = writeEnvFile(emptyDir, {});
      const unresolved = await resolveProjectRuntime({ projectRoot: root, envPath: emptyPath, env: {} });
      assert.equal(unresolved.ok, false);
      if (!unresolved.ok) assert.equal(unresolved.message, RUNTIME_UNRESOLVED_MESSAGE);
    } finally {
      await removeTempDirEventually(emptyDir);
    }
  } finally {
    await removeTempDirEventually(root);
  }
});

test("解析优先级 5：无任何候选/凭据 ⇒ 明确失败（文案含「无法确定项目引擎，请先选择引擎」）", async () => {
  const root = makeTempDir("ans-runtime-unresolved-");
  try {
    const envPath = writeEnvFile(root, {});
    const result = await resolveProjectRuntime({ projectRoot: root, envPath, env: {} });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.message, /无法确定项目引擎，请先选择引擎/);
      assert.deepEqual(result.skipped.map((item) => item.runtime), ["pi", "codex", "claude"]);
    }
  } finally {
    await removeTempDirEventually(root);
  }
});

test("持久化：往返读写、坏件重建、缺省关闭、demo 不落盘", async () => {
  const root = makeTempDir("ans-runtime-state-");
  try {
    const statePath = path.join(root, "user-data", "ans", "runtime-selection.json");
    assert.equal(await readPersistedProjectRuntime(statePath, root), undefined, "缺失文件 ⇒ 无持久化");

    assert.equal((await persistProjectRuntime(statePath, root, "pi")).ok, true);
    assert.equal(await readPersistedProjectRuntime(statePath, root), "pi");
    assert.equal(await readPersistedProjectRuntime(statePath, "/other-project"), undefined);

    writeFileSync(statePath, "not-json");
    assert.equal(await readPersistedProjectRuntime(statePath, root), undefined, "坏件按无持久化处理");
    assert.equal((await persistProjectRuntime(statePath, root, "codex")).ok, true, "坏件可被下一次写入重建");
    assert.equal(await readPersistedProjectRuntime(statePath, root), "codex");

    assert.equal((await persistProjectRuntime(statePath, root, "demo")).ok, false, "demo 不参与自动派发持久化");
    assert.equal(await readPersistedProjectRuntime(statePath, root), "codex", "非法值不改旧记录");

    assert.equal(await readPersistedProjectRuntime(undefined, root), undefined, "持久化关闭 ⇒ 不读");
    assert.equal((await persistProjectRuntime(undefined, root, "pi")).ok, true, "持久化关闭 ⇒ 写入 no-op");
  } finally {
    await removeTempDirEventually(root);
  }
});

// ————————————————— ② Interface 接线（自动验收派发/冷启动补齐） —————————————————

test("冷启动无法确定引擎：不派发、Lead 恰一条明确系统行、不写派发记录", async () => {
  const root = makeTempDir("ans-acceptance-runtime-unresolved-");
  try {
    const flowId = "flow-unresolved";
    writeFlowFile(root, flowId, acceptanceFlow(flowId));
    await seedGovernanceEvidence(root, flowId);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const requests: RuntimeResolutionRequest[] = [];
    const harness = await makeHarness(root, {
      listing,
      resolveRuntimeFn: async (request) => {
        requests.push(request);
        return { ok: false, message: RUNTIME_UNRESOLVED_MESSAGE, skipped: [] };
      },
    });
    try {
      await waitFor(() => deliveryNotes(harness.events, "liaison").some((note) => note.includes("无法确定项目引擎")));
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "引擎无法确定 ⇒ 不派 Proof");
      assert.equal((await verifierDispatches(root, flowId)).length, 0, "不写验收派发记录");
      assert.ok(requests.length >= 1);
      assert.equal(requests[0]!.activeRuntime, undefined, "冷启动没有活跃会话（优先级 1 为空）");
      assert.equal(requests[0]!.persistedRuntime, undefined, "没有持久化选择");
      const notes = deliveryNotes(harness.events, "liaison").filter((note) => note.includes("无法确定项目引擎"));
      assert.equal(notes.length, 1, "同一项目只落一条系统行（不刷屏）");
      await sleep(150);
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0, "无事件 ⇒ 不循环重试");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    await removeTempDirEventually(root);
  }
});

test("解析失败后客户选定引擎：下一次真实 settle 可再检查并成功派发（不永久锁死）", async () => {
  const root = makeTempDir("ans-acceptance-runtime-recover-");
  try {
    const flowId = "flow-recover";
    writeFlowFile(root, flowId, acceptanceFlow(flowId));
    await seedGovernanceEvidence(root, flowId);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    let attempts = 0;
    const harness = await makeHarness(root, {
      listing,
      resolveRuntimeFn: async () => {
        attempts += 1;
        return attempts === 1
          ? { ok: false, message: RUNTIME_UNRESOLVED_MESSAGE, skipped: [] }
          : { ok: true, runtime: "pi", source: "active-session", skipped: [] };
      },
    });
    try {
      await waitFor(() => deliveryNotes(harness.events, "liaison").some((note) => note.includes("无法确定项目引擎")));
      assert.equal(harness.sendsByRole.get("verifier")?.length ?? 0, 0);

      assert.equal((await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "pi" })).ok, true);
      harness.controls.get("executor")!.settle();
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      assert.equal(harness.sendsByRole.get("verifier")!.length, 1, "客户选定引擎后的 settle 触发一次成功派发");
      // 账本追加在发送成功之后异步完成：并发全量下轮询它，而不是立即断言。
      await waitForAsync(async () => (await verifierDispatches(root, flowId)).length === 1);
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    await removeTempDirEventually(root);
  }
});

test("持久化选择被传给解析器；成功派发后用实际 runtime 覆盖持久化记录", async () => {
  const root = makeTempDir("ans-acceptance-runtime-persist-");
  try {
    const flowId = "flow-persist";
    writeFlowFile(root, flowId, acceptanceFlow(flowId));
    await seedGovernanceEvidence(root, flowId);
    const statePath = path.join(root, "user-data", "ans", "runtime-selection.json");
    assert.equal((await persistProjectRuntime(statePath, root, "codex")).ok, true);
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const requests: RuntimeResolutionRequest[] = [];
    const harness = await makeHarness(root, {
      listing,
      runtimeStatePath: statePath,
      resolveRuntimeFn: async (request) => {
        requests.push(request);
        return { ok: true, runtime: "pi", source: "persisted", skipped: [] };
      },
    });
    try {
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      assert.equal(requests[0]!.persistedRuntime, "codex", "持久化选择进入解析请求（优先级 2）");
      assert.equal(requests[0]!.activeRuntime, undefined, "冷启动无活跃会话");
      assert.equal(harness.openInputs.filter((input) => input.roleId === "verifier").at(-1)?.runtime, "pi", "按解析结果开 Proof 会话");
      await waitForAsync(async () => (await readPersistedProjectRuntime(statePath, root)) === "pi");
      assert.equal(await readPersistedProjectRuntime(statePath, root), "pi", "成功派发后用实际 runtime 覆盖旧记录");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    await removeTempDirEventually(root);
  }
});

test("端到端（真实解析器）：冷启动仅 Pi 配置 ⇒ 自动派发选 pi（不再回退 claude）", async () => {
  const root = makeTempDir("ans-acceptance-runtime-real-");
  try {
    const flowId = "flow-real-pi";
    writeFlowFile(root, flowId, acceptanceFlow(flowId));
    await seedGovernanceEvidence(root, flowId);
    const envPath = writeEnvFile(root, PI_KEYS); // 仅 Pi 凭据齐全（无 ANTHROPIC_API_KEY）
    const statePath = path.join(root, "user-data", "ans", "runtime-selection.json");
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const harness = await makeHarness(root, {
      listing,
      envFilePath: envPath,
      piConfigEnv: {}, // 隔离真实 process.env
      runtimeStatePath: statePath,
    });
    try {
      await waitFor(() => (harness.sendsByRole.get("verifier")?.length ?? 0) > 0);
      const verifierOpen = harness.openInputs.filter((input) => input.roleId === "verifier").at(-1);
      assert.equal(verifierOpen?.runtime, "pi", "真实解析器按「仅 Pi 凭据」选 pi");
      await waitForAsync(async () => (await verifierDispatches(root, flowId)).length === 1);
      await waitForAsync(async () => (await readPersistedProjectRuntime(statePath, root)) === "pi");
      assert.equal(await readPersistedProjectRuntime(statePath, root), "pi", "成功派发后持久化 pi，供下次冷启动");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    await removeTempDirEventually(root);
  }
});

test("客户 openSession 成功即记住 per-project 引擎选择（供下次冷启动优先级 2）", async () => {
  const root = makeTempDir("ans-runtime-open-persist-");
  try {
    const listing: ProjectListing = { ...listingWithProjectRoles(trioListing(), ["executor"]), projectRoot: root };
    const statePath = path.join(root, "user-data", "ans", "runtime-selection.json");
    const harness = await makeHarness(root, { listing, runtimeStatePath: statePath });
    try {
      const opened = await harness.iface.openSession({ projectRoot: root, roleId: "executor", runtime: "codex" });
      assert.equal(opened.ok, true, opened.ok ? "" : (opened.error ?? "unknown"));
      await waitForAsync(async () => (await readPersistedProjectRuntime(statePath, root)) === "codex");
      assert.equal(await readPersistedProjectRuntime(statePath, root), "codex", "成功开启会话后持久化所选引擎");
    } finally {
      await harness.iface.stopSession();
    }
  } finally {
    await removeTempDirEventually(root);
  }
});
