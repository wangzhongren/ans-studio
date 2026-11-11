// test/编排/run-role-fixed.test.ts
// T3 B1（2026-11-10）：B1 AC-12/AC-23——run-role per-flow fixed 模式：模块 context 注入 +
// legacy trunk/git/VCA/stable 工具**不注入**；legacy 模式注入逐字不变。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { openRoleSession, type AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RuntimeAdapter,
  RoleSession,
  SessionEvent,
  WriteGate,
} from "../../src/model/runtime.ts";

function makeTrioProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-runrole-fixed-"));
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    builtInRoles: ["chief", "convener"],
    governanceModel: "trio",
  };
}

function fakeSession(): RoleSession {
  return {
    async prompt(): Promise<void> {},
    events(): AsyncIterable<SessionEvent> {
      return (async function* () {
        yield { kind: "settled", summary: "完成" } as SessionEvent;
      })();
    },
    async dispose(): Promise<void> {},
  };
}

async function openWithMode(mode: "fixed" | "legacy"): Promise<AdapterCapabilities | undefined> {
  const project = makeTrioProject();
  let captured: AdapterCapabilities | undefined;
  const createAdapter = (_gate: WriteGate, capabilities?: AdapterCapabilities): RuntimeAdapter => {
    captured = capabilities;
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return fakeSession();
      },
      async prepareRole() {
        return {} as never;
      },
      async bindPreparedRole(): Promise<RoleSession> {
        return fakeSession();
      },
    } as RuntimeAdapter;
  };
  const handle = await openRoleSession({
    roleId: "convener",
    project,
    runtime: "pi",
    workflowMode: mode,
    gitQuery: (async () => ({ ok: true })) as never,
    gitCandidate: (async () => ({ ok: true })) as never,
    gitPublish: (async () => ({ ok: true })) as never,
    requestStableWrite: (async () => ({ ok: true })) as never,
    submitRefactor: (async () => ({ ok: true })) as never,
    completeTeamPlan: (async () => ({ ok: true })) as never,
    closeCreatedTask: (async () => ({ ok: true })) as never,
  }, { createAdapter });
  await handle.dispose();
  fs.rmSync(project.projectRoot, { recursive: true, force: true });
  return captured;
}

test("fixed 会话：不注入 legacy trunk/git/VCA/stable 工具；保留 completeTeamPlan/closeCreatedTask；注入模块 context 段", async () => {
  const capabilities = await openWithMode("fixed");
  assert.ok(capabilities);
  if (capabilities === undefined) return;
  assert.equal(capabilities.gitQuery, undefined, "fixed 不注入 git_query");
  assert.equal(capabilities.gitCandidate, undefined, "fixed 不注入 git_candidate");
  assert.equal(capabilities.gitPublish, undefined, "fixed 不注入 git_publish");
  assert.equal(capabilities.requestStableWrite, undefined, "fixed 不注入 request_stable_write");
  assert.equal(capabilities.submitRefactor, undefined, "fixed 不注入 submit_refactor");
  assert.equal(capabilities.completeTeamPlan !== undefined, true, "fixed 保留 complete_team_plan（v4）");
  assert.equal(capabilities.closeCreatedTask !== undefined, true, "fixed 保留 close_created_task（v2）");
  assert.ok(capabilities.contextSections !== undefined && capabilities.contextSections.length > 0);
  const contextText = (capabilities.contextSections ?? []).join("\n");
  assert.match(contextText, /报告期望/, "fixed 注入模块 context({matrix}) 段");
});

test("legacy 会话（缺省）：同一注入面逐字保留（git/stable/refactor 均注入）", async () => {
  const capabilities = await openWithMode("legacy");
  assert.ok(capabilities);
  if (capabilities === undefined) return;
  assert.equal(capabilities.gitQuery !== undefined, true);
  assert.equal(capabilities.gitCandidate !== undefined, true);
  assert.equal(capabilities.gitPublish !== undefined, true);
  assert.equal(capabilities.requestStableWrite !== undefined, true);
  assert.equal(capabilities.submitRefactor !== undefined, true);
});
