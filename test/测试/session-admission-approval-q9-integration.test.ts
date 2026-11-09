// test/测试/session-admission-approval-q9-integration.test.ts
// W5（2026-11-08「删除全部预知式门控」）**Q16 取代改写**：
// 旧断言（第一变更 B1 v1 `P1.3-B1-AC-26` / B1-EV3「`native-factory-plan-unavailable` 仅 codex」）——
// 「受保护项目 + 真实 shell/active 会话时，`git_candidate init` 仍被 `inspectInitializationProtection`
// 注册表级拒绝（`git-native-surface-unproven` / `git-core-creation-proof-unavailable`）」——
// 已由本变更取代（设计 P1.4 §3.3/§3.4.3/§4.2/Q16；B1 v1 §0 Q16）。
//
// 新契约：Git 写/初始化改为**动作时授权**——真实 actor Core 会话/角色/项目/任务/回合/active tool +
// 角色 ACL/`checkGitPolicy`/host lease/两阶段复检 + write-ahead sidecar；注册表级「全部 active 条目
// strict observed/native factoryPlan/processCoverage」要求删除。旧注册表级拒绝码零生产；init 的拒绝只来自
// 真实身份/ACL/策略/根/租约等合法原因（本文件负例：inventory 记录 taskId 与动作 taskId 不符 ⇒
// `git-actor-core-binding-unproven`，无副作用）。
//
// 本文件证据形态：进程内同时存在真实 Codex 会话（chief + 带 shell 的 convener；严格 surface 仍
// `unknown`，作为证据如实存在）与真实 init 动作链（actor = 真实 Core 回合里的 `git_candidate`）；init 成功并
// 产生 init.json/仓库/sidecar authorization。
//
// 纪律：不运行真实模型/Electron/CDP；不写产品源码；不删除/放宽断言、不加 skip、不使用 --test-force-exit。
// 断言改写逐条见 `角色卡/测试/docs/change/2026-11-08_W5_remove-predictive-gates.md`（before/after 与理由）。
import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createGitRoleRuntime, recordGitHostInventory, recordTaskObservation, type GitHostInventory } from "../../src/pipeline/orchestration/trunk-runtime.ts";
import { createFsTrunkStore, readGitActionAuthorizations, readGitInitializationRecord } from "../../src/provider/trunk/public/trunk-store.ts";
import { createDemoRuntimeAdapter } from "../../src/provider/runtime/tools.ts";
import { classifyShell, defaultShellRules } from "../../src/service/gate/shell-rules.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RuntimeProviderOptions, TaskCreatedEvent } from "../../src/model/runtime.ts";
import {
  AT, bindSession, disposeOpenedSessions, entryOf, gitCandidateScript, holdableGitCandidate, sha256, until,
} from "./git-action-cross-runtime-fixture.ts";

after(disposeOpenedSessions);

const RETIRED_CODES = ["git-core-creation-proof-unavailable", "git-native-surface-unproven",
  "git-unclosed-effect-registered", "official-pure-preparation-unproven", "native-factory-plan-unavailable"] as const;

async function withCodexEnv<T>(fn: () => Promise<T>): Promise<T> {
  const keys = ["ANS_CODEX_WIRE_API", "ANS_CODEX_WEB_SEARCH", "ANS_D1_Q9_KEY"] as const;
  const previous = keys.map((key) => [key, process.env[key]] as const);
  process.env.ANS_CODEX_WIRE_API = "chat";
  process.env.ANS_CODEX_WEB_SEARCH = "off";
  process.env.ANS_D1_Q9_KEY = "fixture-not-a-real-key";
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

/** trio 项目（内置六角色）；治理接受证据 accepted ⇒ 内置角色边界与审计边界可用。 */
async function makeTrioProject(prefix: string): Promise<ProjectConfig> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  return {
    projectRoot: root,
    skillRoot: path.join(root, "skill-root"),
    roles: {},
    governanceModel: "trio",
    builtInRoles: ["chief", "product", "rapporteur", "nominator", "convener", "verifier"],
    governanceBoundary: { path: "角色卡/governance-boundary.yaml", acceptance: { accepted: true, source: "test:w5-q16" } },
  };
}

async function markRequired(root: string): Promise<void> {
  const sourceId = `init-source-${createHash("sha256").update(root).digest("hex")}`;
  const dir = path.join(root, ".ans", "trunk", "initialization-sources");
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${sourceId}.json`), JSON.stringify({
    schema: "repository-work-source/v1",
    kind: "customer-turn",
    sourceId,
    projectRoot: root,
  }));
}

const exists = (target: string) => fs.existsSync(target);

test("Q16 取代 P1.3-B1-AC-26：受保护 + 真实 Codex shell 会话在进程内时 actor init 动作时授权通过、旧注册表级拒绝码零产生；身份不符负例仍 fail-closed", async () => {
  await withCodexEnv(async () => {
    const project = await makeTrioProject("ans-w5-q16-");
    const root = project.projectRoot;
    const canonical = await fsp.realpath(root);
    const runtimeOptions = { baseUrl: "http://127.0.0.1:9/v1", modelId: "w5-q16", apiKeyEnvVar: "ANS_D1_Q9_KEY" };
    let chief: Awaited<ReturnType<typeof openRoleSession>> | undefined;
    let shellConvener: Awaited<ReturnType<typeof openRoleSession>> | undefined;
    // 真实 Core 回合中的 actor：git_candidate 保持 active（真实包装层 + 桩件 provider 执行脚本；无真实模型请求）。
    const held = holdableGitCandidate();
    const actor = await bindSession(root, "codex", "convener", {
      gitCandidate: held.gitCandidate,
      providerFactories: { codex: (options) => {
        return createDemoProvider(options);
      } },
    });
    try {
      // 受保护范围证据在 actor 绑定之后建立（custom/桩件 factory 在 required 范围下仍按既有
      // `protected-scope-default-native-plan-required` 拒绝——这不是本变更放开的门）。
      await markRequired(root);
      // 真实 Codex 会话（chief 无 shell；convener 带 shell/审批链）：绑定成功且严格 surface 仍 unknown。
      chief = await openRoleSession({ roleId: "chief", runtime: "codex", project, autoRepin: false }, { runtimeOptions });
      shellConvener = await openRoleSession({
        roleId: "convener",
        runtime: "codex",
        project,
        autoRepin: false,
        shellOperatorOnly: { operatorChannel: () => ({ outcome: "deny", operatorId: "w5-客户", reason: "w5-q16" }), classifyShell, rules: defaultShellRules() },
      }, { runtimeOptions });
      assert.equal(typeof chief.sessionId, "string");
      assert.equal(typeof shellConvener.sessionId, "string");
      const shellSurface = shellConvener.inspectToolSurface!();
      assert.ok(shellSurface.appTools.includes("run_shell"), "真实 shell 会话必须 arm run_shell");
      assert.equal(shellSurface.status, "unknown", "含 shell ⇒ strict surface unknown（证据，不再是注册表级拒绝理由）");
      // actor 进入真实活动回合。
      const pumping = actor.prompt("Invoke git_candidate for the W5 Q16 fixture");
      try {
        await until(() => entryOf(actor.sessionId)?.lifecycle?.activeTools.some(tool => tool.name === "git_candidate") === true);
        const taskId = "w5-q16-init-child", runId = "run-w5-q16";
        const store = createFsTrunkStore(root);
        const run = { schema: "ans-run/v1" as const, runId, flowId: "w5-q16", state: "draft" as const, documents: {}, createdAt: AT };
        const runSaved = await store.compareAndSwapRunRecord!(runId, null, run as never);
        assert.ok(runSaved.ok, JSON.stringify(runSaved));
        const sourceId = `init-source-${sha256(canonical + ":q16")}`;
        const source = await store.writeInitializationSource!(sourceId, Buffer.from(JSON.stringify({
          schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot: canonical, flowId: "w5-q16",
          parent: { roleId: "chief", sessionId: chief.sessionId, inputAccepted: true, settled: false },
        })).toString("base64"));
        assert.ok(source.ok, JSON.stringify(source));
        if (!source.ok) return;
        const task: TaskCreatedEvent = {
          v: 1, at: AT, kind: "task.created", taskId, from: "chief", to: "convener",
          text: "W5 Q16 initialization fixture", sideEffect: "unknown", idempotencyKey: taskId,
          flowId: "w5-q16", runId, runState: "draft",
          workSourceRef: { kind: "chief-customer-turn", sourceId, path: source.value.path, sha256: source.value.sha256 },
        } as TaskCreatedEvent;
        let inventoryRevision = 0;
        const publish = (actorTaskId: string) => {
          inventoryRevision += 1;
          const inventory = {
            source: "desktop-session-manager" as const, projectRoot: root, observedAt: AT, revision: inventoryRevision,
            sessions: [
              { hostHandleId: "w5-q16-chief", roleId: "chief", runtime: "codex" as const, phase: "live" as const, coreSessionId: chief!.sessionId, errors: [] },
              { hostHandleId: "w5-q16-shell", roleId: "convener", runtime: "codex" as const, phase: "live" as const, coreSessionId: shellConvener!.sessionId, errors: [] },
              { hostHandleId: "w5-q16-actor", roleId: "convener", runtime: "codex" as const, phase: "live" as const, coreSessionId: actor.sessionId, taskId: actorTaskId, runId, errors: [] },
            ],
            pendingOpens: [], queuedDispatches: [], activeDeliveries: [], coverage: "unknown" as const, reasons: [],
          };
          const published = recordGitHostInventory(inventory);
          assert.ok(published.ok, JSON.stringify(published));
        };
        const recorded = await recordTaskObservation({ projectRoot: root, event: task });
        assert.ok(recorded.ok, JSON.stringify(recorded));
        const runtime = createGitRoleRuntime({ projectRoot: root, context: { actorRoleId: "convener", taskId, runId, readPaths: ["."] } });
        // ——— 负例（真实身份原因）：inventory 记录的 taskId 与动作 taskId 不符 ⇒ git-actor-core-binding-unproven ———
        publish("w5-q16-different-task");
        const negativeOp = "w5-q16-neg-init";
        const negative = await runtime.gitCandidate({ action: "init", operationId: negativeOp,
          base: { ref: "refs/ans/trunk", oid: null }, message: "W5 Q16 negative init" } as never);
        assert.equal(negative.status, "blocked", JSON.stringify(negative));
        assert.equal(negative.status === "blocked" ? negative.code : undefined, "git-actor-core-binding-unproven",
          JSON.stringify(negative));
        for (const retired of RETIRED_CODES) assert.notEqual(negative.status === "blocked" ? negative.code : undefined, retired, retired);
        assert.equal(exists(path.join(root, ".git")), false, "身份拒绝不得初始化仓库");
        assert.equal(exists(path.join(root, ".ans/trunk/operations", sha256(negativeOp))), false, "身份拒绝不得写操作目录");
        // ——— 正向（Q16 取代的核心断言）：同一进程内有真实 shell/active Codex 会话 ⇒ actor init 成功 ———
        publish(taskId);
        const positiveOp = "w5-q16-pos-init";
        const positive = await runtime.gitCandidate({ action: "init", operationId: positiveOp,
          base: { ref: "refs/ans/trunk", oid: null }, message: "W5 Q16 positive init" } as never);
        assert.equal(positive.status, "prepared", JSON.stringify(positive));
        for (const retired of RETIRED_CODES) {
          assert.equal(JSON.stringify(positive).includes(retired), false, `旧码 ${retired} 零生产`);
        }
        // 真实效果与 write-ahead 审计：sidecar（两键 digest）先于/伴随 init.json 与仓库存在。
        const journal = await readGitInitializationRecord(root, positiveOp);
        assert.ok(journal, "init.json 存在");
        assert.equal(journal.stage, "candidate-created");
        assert.equal(exists(path.join(root, ".git")), true, "仓库已真实创建");
        const sidecar = await readGitActionAuthorizations(root, positiveOp);
        assert.equal(sidecar.ok, true);
        if (!sidecar.ok) return;
        assert.equal(sidecar.records.length, 1);
        const record = sidecar.records[0]!;
        assert.equal(record.template, "init");
        assert.equal(record.actorRoleId, "convener");
        assert.equal(record.coreSessionId, actor.sessionId);
        assert.equal(record.taskId, taskId);
        assert.deepEqual(Object.keys(record.policyInputDigests), ["init", "candidate"], "R2：init 两键");
        assert.match(record.policyInputDigests.init!, /^[a-f0-9]{64}$/);
        assert.match(record.policyInputDigests.candidate!, /^[a-f0-9]{64}$/);
        assert.equal(Object.hasOwn(record.optionalEvidence, "applicationMediation"), false, "PR #72：sidecar 不读应用中介证据");
        // 真实 shell 会话仍是证据事实（不参与放行判定）：严格 surface unknown、lifecycle 可读。
        assert.equal(entryOf(shellConvener.sessionId!)?.toolSurface?.status, "unknown");
        assert.equal(shellConvener.inspectLifecycle!().sessionId, shellConvener.sessionId);
      } finally {
        held.release();
        await pumping;
      }
    } finally {
      await shellConvener?.dispose().catch(() => undefined);
      await chief?.dispose().catch(() => undefined);
      await fsp.rm(root, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});

// —— 局部辅助（桩件 provider 与 fixture 模块同源规则；脚本仅用于保持真实 Core 回合的 active tool） ——
function createDemoProvider(options: RuntimeProviderOptions) {
  return createDemoRuntimeAdapter(options, gitCandidateScript("w5-q16-held-tool"));
}
