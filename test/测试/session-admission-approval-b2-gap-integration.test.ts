// test/测试/session-admission-approval-b2-gap-integration.test.ts
// B2 补证（2026-11-08）：AC-2（Pi + 项目角色 + shellOperatorChannel，真实 openRoleSession/bindPreparedRuntimeRole 路径）
// 与 AC-4（Claude/Pi 无 shell 工具时受保护会话仍可创建）。
//
// 真实件：openRoleSession / bindPreparedRuntimeRole / createRuntimeAdapter（Service 准入）/ assembleProjectShellGate /
// createShellGate（唯一登记）/ 真实 file sink 审批链 / 诊断 session.open.*。
// 官方 Pi/Claude 适配器以真实 provider 工厂构造（不注入 fake provider，保持 factoryProvenance=default-production）；
// 不运行真实模型（bind 只构造会话，不发起模型请求；测试后 dispose）。
//
// 纪律：只写 test/测试/；不改产品代码；不删测试/放宽断言/加 skip/force-exit；不提交/推送。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  createRuntimeAdapter,
  type RuntimeSessionOptions,
} from "../../src/service/runtime/session.ts";
import {
  createRuntimeAdapterFactory,
  openRoleSession,
  type RuntimeAdapterFactoryOptions,
} from "../../src/pipeline/orchestration/run-role.ts";
import { assembleProjectShellGate } from "../../src/pipeline/orchestration/shell-arming.ts";
import { inspectShellApproval, probeShellApproval } from "../../src/common/shared/shell-approval-binding.ts";
import { SHELL_AUDIT_REL_PATH } from "../../src/common/编排/shell-audit.ts";
import { classifyShell, defaultShellRules } from "../../src/service/gate/shell-rules.ts";
import { configureDiagnostics, flushDiagnostics, disposeDiagnostics } from "../../src/common/shared/diagnostics.ts";
import type { BoundaryEntry } from "../../src/model/boundary.ts";
import type { ProjectConfig, ResolvedRole } from "../../src/model/role.ts";
import type { ShellGate, WriteGate } from "../../src/model/runtime.ts";

const AUDIT_ENTRY: BoundaryEntry = { root: "project", path: "docs/audit/", kind: "conditional-directory", condition: "shell-gate", purpose: "shell 闸审计留痕" };
void AUDIT_ENTRY;

function roleBoundaryYaml(roleId: string): string {
  return [
    `role: ${roleId}`,
    "entries:",
    "  - kind: file",
    "    path: src/thing.ts",
    "    purpose: 测试条目",
    "  - kind: conditional-directory",
    "    path: docs/audit/",
    "    condition: shell-gate",
    "    root: project",
    "    purpose: shell 闸审计留痕",
    "",
  ].join("\n");
}

/** 项目角色夹具（worker；非治理角色名 ⇒ 项目角色三层链）。 */
async function makeProject(prefix: string): Promise<ProjectConfig> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
  const dir = path.join(root, "角色卡", "worker");
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, "role-card.md"), "# worker\n");
  await fsp.writeFile(path.join(dir, "boundary.yaml"), roleBoundaryYaml("worker"));
  return {
    projectRoot: root,
    skillRoot: path.join(root, "skill-root"),
    roles: { worker: { card: "角色卡/worker/role-card.md", boundary: "角色卡/worker/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/worker/boundary.yaml", acceptance: { accepted: true, source: "test:b2" } },
  };
}

async function markRequired(root: string): Promise<void> {
  const sourceId = `init-source-${createHash("sha256").update(root).digest("hex")}`;
  const dir = path.join(root, ".ans", "trunk", "initialization-sources");
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${sourceId}.json`), JSON.stringify({
    schema: "repository-work-source/v1", kind: "customer-turn", sourceId, projectRoot: root,
  }));
}

function resolvedRole(id = "worker"): ResolvedRole {
  return {
    id, kind: "project", cardText: `# ${id}`,
    boundary: { entries: [], boundarySource: "fixture", acceptance: { accepted: true, source: "fixture" } },
    boundarySource: "fixture", location: { card: "fixture", boundary: "fixture" },
  };
}

const allowGate: WriteGate = (target) => ({ allowed: true, matchedEntry: { root: "project", path: target, kind: "file", purpose: "b2-fixture" } });
const denyOperator = () => ({ outcome: "deny" as const, operatorId: "b2-客户", reason: "b2 fixture deny" });

async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const keys = Object.keys(vars);
  const previous = keys.map((key) => [key, process.env[key]] as const);
  for (const key of keys) process.env[key] = vars[key]!;
  try { return await fn(); } finally { for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

async function withDiagnostics<T>(fn: () => Promise<T>): Promise<{ value: T; events: Array<{ event?: string; roleId?: string; projectRoot?: string }> }> {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "ans-b2-diagnostics-"));
  configureDiagnostics({ directory });
  const events: Array<{ event?: string; roleId?: string; projectRoot?: string }> = [];
  try {
    const value = await fn();
    await flushDiagnostics();
    for (const file of await fsp.readdir(directory)) {
      if (!/^ans-diagnostics-.*\.jsonl$/.test(file)) continue;
      const text = await fsp.readFile(path.join(directory, file), "utf8");
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line) as { event?: string; roleId?: string; projectRoot?: string };
          events.push({ event: row.event, roleId: row.roleId, projectRoot: row.projectRoot });
        } catch { /* 坏行跳过 */ }
      }
    }
    return { value, events };
  } finally {
    await disposeDiagnostics();
  }
}

/** Pi 官方 provider 显式配置（假值；不触发网络——bind 只构造会话，prompt 才发请求）。 */
function piOptions(): RuntimeAdapterFactoryOptions {
  return {
    providerId: "ans-gateway",
    baseUrl: "http://127.0.0.1:9/v1",
    modelId: "b2-pi-fixture",
    apiKeyEnvVar: "ANS_B2_PI_KEY",
  };
}

/** Claude 官方 provider 显式配置（假值；bind 不请求模型）。 */
function claudeOptions(): RuntimeAdapterFactoryOptions {
  return {
    baseUrl: "http://127.0.0.1:9",
    modelId: "b2-claude-fixture",
    apiKeyEnvVar: "ANS_B2_CLAUDE_KEY",
  };
}

const ENV_FIXTURES = { ANS_B2_PI_KEY: "fixture-not-a-real-key", ANS_B2_CLAUDE_KEY: "fixture-not-a-real-key" };

function shellToolsOf(appTools: readonly string[]): string[] {
  return appTools.filter((tool) => tool === "run_shell" || tool === "start_background_task");
}

// —————————————————————— AC-2：Pi + 项目角色 + shellOperatorChannel（真实服务路径） ——————————————————————

test("B2-AC2 Pi + 项目角色 + shellOperatorChannel：真实 openRoleSession 装配（file sink 审批链）⇒ prepareRole observed+token+approvalChain、真实 bind 成功、session.open.ready、appTools 含 shell", async () => {
  await withEnv(ENV_FIXTURES, async () => {
    const project = await makeProject("ans-b2-ac2-");
    await markRequired(project.projectRoot);
    try {
      // 1) 真实 openRoleSession 全链（项目角色三层链；advisoryRuleset 缺省 true；真实 file sink）。
      const { events } = await withDiagnostics(async () => {
        const handle = await openRoleSession({
          roleId: "worker",
          runtime: "pi",
          project,
          autoRepin: false,
          shellOperatorChannel: denyOperator,
          shellArming: { pmRoleId: "worker", classifyShell, rules: defaultShellRules() },
        }, { runtimeOptions: piOptions() });
        try {
          assert.equal(typeof handle.sessionId, "string", "session.open.ready 的会话必须有 id");
          assert.equal(handle.runtime, "pi");
          assert.equal(handle.roleId, "worker");
          const surface = handle.inspectToolSurface!();
          assert.deepEqual(shellToolsOf(surface.appTools).sort(), ["run_shell", "start_background_task"], `appTools: ${surface.appTools.join(",")}`);
          assert.equal(surface.status, "unknown", "Pi strict surface 仍 unknown（不冒充 native observed）");
        } finally {
          await handle.dispose();
        }
      });
      const ready = events.filter((row) => row.event === "session.open.ready");
      assert.equal(ready.length, 1, `diagnostics: ${JSON.stringify(events)}`);
      assert.equal(ready[0]!.roleId, "worker", "session.open.ready 必须携带 roleId");
      assert.equal(path.resolve(ready[0]!.projectRoot ?? "").toLowerCase(), path.resolve(project.projectRoot).toLowerCase());

      // 2) 同一真实装配上显式核对 plan.approvalChain / token / 真实 bindPreparedRole。
      const gate = await assembleProjectShellGate({
        project,
        pmRoleId: "worker",
        classifyShell,
        rules: defaultShellRules(),
        operatorChannel: denyOperator,
        sessionDeps: { createAdapter: createRuntimeAdapterFactory(project, "pi", piOptions()) },
      });
      const facts = inspectShellApproval(gate);
      assert.ok(facts, "createShellGate 构造成功后必须已登记（唯一登记点）");
      assert.deepEqual(facts.audit, { sink: "file", durable: true, probe: "unknown", relPath: SHELL_AUDIT_REL_PATH });
      assert.equal((await probeShellApproval(gate))?.audit.probe, "ok", "真实 file sink 探针（含 refresh 一次重试）必须 ok");

      const adapter = createRuntimeAdapter({
        runtime: "pi", gate: allowGate, projectRoot: project.projectRoot, skillRoot: project.skillRoot, shellGate: gate, ...piOptions(),
      } satisfies RuntimeSessionOptions);
      const prepared = await adapter.prepareRole!(resolvedRole("worker"));
      assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
      assert.equal(prepared.plan.factoryProvenance, "default-production");
      assert.ok(prepared.token, "observed 必须发 token");
      const chain = prepared.plan.approvalChain;
      assert.ok(chain, "plan.approvalChain 必须存在");
      assert.equal(chain.source, "orchestration-shell-gate");
      assert.equal(chain.mode, "rules-advisory", "项目三层链 advisory 缺省");
      assert.equal(chain.operatorChannel, true);
      assert.deepEqual(chain.audit, { sink: "file", durable: true, probe: "ok", relPath: SHELL_AUDIT_REL_PATH });
      assert.equal(chain.projectRoot, project.projectRoot);
      assert.equal(prepared.plan.reasons.some((reason) => reason.startsWith("native-factory-plan-")), false, "Pi 不产生 native-factory-* 阻断");

      const session = await adapter.bindPreparedRole!(prepared.token!);
      try {
        const surface = session.inspectToolSurface!();
        assert.deepEqual(shellToolsOf(surface.appTools).sort(), ["run_shell", "start_background_task"]);
      } finally {
        await session.dispose();
      }
    } finally {
      await fsp.rm(project.projectRoot, { recursive: true, force: true });
    }
  });
});

// —————————————————————— AC-4：Claude/Pi 无 shell 工具（受保护项目仍可创建） ——————————————————————

for (const runtime of ["claude", "pi"] as const) {
  test(`B2-AC4 ${runtime} 无 shell 工具：受保护会话 session.open.ready 且 appTools 不含 run_shell/start_background_task（无 approvalChain、无 native-factory-* 阻断）`, async () => {
    await withEnv(ENV_FIXTURES, async () => {
      const project = await makeProject(`ans-b2-ac4-${runtime}-`);
      await markRequired(project.projectRoot);
      const options = runtime === "claude" ? claudeOptions() : piOptions();
      try {
        // 1) 真实 openRoleSession（不注入 shellOperatorChannel ⇒ 不 arm shell）。
        const { events } = await withDiagnostics(async () => {
          const handle = await openRoleSession({ roleId: "worker", runtime, project, autoRepin: false }, { runtimeOptions: options });
          try {
            assert.equal(typeof handle.sessionId, "string");
            assert.equal(handle.runtime, runtime);
            assert.equal(handle.roleId, "worker");
            const surface = handle.inspectToolSurface!();
            assert.deepEqual(shellToolsOf(surface.appTools), [], `appTools: ${surface.appTools.join(",")}`);
            assert.ok(surface.appTools.includes("write_file") || surface.appTools.includes("edit_file"), "写工具仍注册（写门回归由既有套件覆盖）");
          } finally {
            await handle.dispose();
          }
        });
        const ready = events.filter((row) => row.event === "session.open.ready");
        assert.equal(ready.length, 1, `diagnostics: ${JSON.stringify(events)}`);
        assert.equal(ready[0]!.roleId, "worker");

        // 2) 显式 Service 准入：observed + token，无 approvalChain，无 native-factory-* 阻断；bind 成功且工具面无 shell。
        const adapter = createRuntimeAdapter({
          runtime, gate: allowGate, projectRoot: project.projectRoot, skillRoot: project.skillRoot, ...options,
        } satisfies RuntimeSessionOptions);
        const prepared = await adapter.prepareRole!(resolvedRole("worker"));
        assert.equal(prepared.plan.status, "observed", JSON.stringify(prepared.plan.reasons));
        assert.ok(prepared.token);
        assert.equal("approvalChain" in prepared.plan, false, "无 shell ⇒ 不需要 approvalChain");
        assert.equal(prepared.plan.reasons.some((reason) => reason.startsWith("native-factory-plan-")), false, "无 native-factory-* 阻断");
        const session = await adapter.bindPreparedRole!(prepared.token!);
        try {
          const surface = session.inspectToolSurface!();
          assert.deepEqual(shellToolsOf(surface.appTools), []);
        } finally {
          await session.dispose();
        }
      } finally {
        await fsp.rm(project.projectRoot, { recursive: true, force: true });
      }
    });
  });
}
