// test/桌面应用/chief-workflow.test.ts
// B 批（2026-10-28）：chief 目标能力（dispatch_task/role_status/session_tail/role_activity_log）在运行时注入端生效；
// convener 旧能力保留、但不获得 role_activity_log；项目角色零注入（结构性 fail-closed）。
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionManager } from "../../app/desktop/session.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";
import { appendRoleLog } from "../../src/common/编排/role-log.ts";
import { buildGovernedTools } from "../../src/provider/runtime/tools.ts";
import type { WriteGate } from "../../src/model/runtime.ts";
import type { ProjectListing } from "../../src/service/role/resolve-role.ts";
import type { OrchestrationEvent } from "../../src/common/编排/handback.ts";
import type { RoleSessionHandle } from "../../src/pipeline/orchestration/run-role.ts";
import type { DispatchTaskFn, RoleActivityLogFn, RoleStatusFn, SessionTailFn, TerminateRoleRunFn, RedispatchTaskFn } from "../../src/model/runtime.ts";

const tick = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function listing(root: string): ProjectListing {
  const builtIn = (roleId: string, fn: "chief" | "schedule"): ProjectListing["roles"][number] => ({
    roleId,
    cardPath: "",
    boundaryPath: "",
    cardText: roleId,
    boundary: { entries: [], boundarySource: `<built-in:${roleId}>`, acceptance: { accepted: false, source: "" } },
    builtIn: true,
    governanceFunction: fn,
  });
  return {
    projectRoot: root,
    roles: [
      builtIn("chief", "chief"),
      builtIn("convener", "schedule"),
      { roleId: "worker", cardPath: "角色卡/worker/role-card.md", boundaryPath: "角色卡/worker/boundary.yaml", cardText: "worker", boundary: { entries: [{ root: "project", path: "src/w.ts", kind: "file", purpose: "p" }], boundarySource: "角色卡/worker/boundary.yaml", acceptance: { accepted: false, source: "" } } },
    ],
    warnings: [],
    hasRoles: true,
    primaryRoleId: "chief",
    governanceModel: "trio",
  };
}

interface Caps {
  dispatchTask?: DispatchTaskFn;
  roleStatus?: RoleStatusFn;
  sessionTail?: SessionTailFn;
  roleActivityLog?: RoleActivityLogFn;
  terminateRoleRun?: TerminateRoleRunFn;
  redispatchTask?: RedispatchTaskFn;
}

test("能力矩阵（B 生效）：chief 六能力；convener 旧三能力但无 role_activity_log/终止/重派；项目角色零注入", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chief-"));
  const caps: Record<string, Caps> = {};
  const makeHandle = (): RoleSessionHandle => ({
    async send() {},
    events() {
      return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(50); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } };
    },
    async dispose() {},
  });
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = input as Caps;
      return makeHandle();
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing(root) : undefined),
    emitEvent: () => {},
  });
  try {
    for (const roleId of ["chief", "convener", "worker"]) {
      const opened = await mgr.open({ projectRoot: root, roleId, runtime: "demo" });
      assert.equal(opened.ok, true, `${roleId}: ${opened.error ?? ""}`);
    }
    assert.equal(typeof caps.chief.dispatchTask, "function");
    assert.equal(typeof caps.chief.roleStatus, "function");
    assert.equal(typeof caps.chief.sessionTail, "function");
    assert.equal(typeof caps.chief.roleActivityLog, "function");
    assert.equal(typeof caps.chief.terminateRoleRun, "function", "chief 获得 terminate_role_run");
    assert.equal(typeof caps.chief.redispatchTask, "function", "chief 获得 redispatch_task");
    assert.equal(typeof caps.convener.dispatchTask, "function", "convener 旧 dispatch 保留至 D");
    assert.equal(typeof caps.convener.roleStatus, "function");
    assert.equal(typeof caps.convener.sessionTail, "function");
    assert.equal(caps.convener.roleActivityLog, undefined, "role_activity_log 只给幕僚");
    assert.equal(caps.convener.terminateRoleRun, undefined, "终止动作只给幕僚");
    assert.equal(caps.convener.redispatchTask, undefined, "重派动作只给幕僚");
    assert.equal(caps.worker.dispatchTask, undefined);
    assert.equal(caps.worker.roleStatus, undefined);
    assert.equal(caps.worker.sessionTail, undefined);
    assert.equal(caps.worker.roleActivityLog, undefined);
    assert.equal(caps.worker.terminateRoleRun, undefined);
    assert.equal(caps.worker.redispatchTask, undefined);
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("role_activity_log 数据面：只读、脱敏、字段/坏行如实；role_status 带 lastActivityAt", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ans-chief-log-"));
  const listingNow = listing(root);
  const caps: Record<string, Caps> = {};
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      caps[input.roleId] = input as Caps;
      return {
        async send() {},
        events() { return { [Symbol.asyncIterator]() { return { async next(): Promise<IteratorResult<OrchestrationEvent>> { await tick(50); return { value: undefined as unknown as OrchestrationEvent, done: true }; } }; } }; },
        async dispose() {},
      };
    },
    createPiAdapterFactory: () => { throw new Error("no pi"); },
    createDemoAdapter: () => { throw new Error("no demo"); },
    buildProjectConfig,
    getListing: (r) => (r === root ? listingNow : undefined),
    emitEvent: () => {},
  });
  try {
    await mgr.open({ projectRoot: root, roleId: "chief", runtime: "demo" });
    await tick(30);
    await appendRoleLog(root, "worker", { kind: "tool.result", tool: "write_file", status: "ok", summary: "写入 src/w.ts token=sk-1234567890abcdef", ref: "src/w.ts" });
    const log = (await caps.chief.roleActivityLog!({ roleId: "worker", limit: 10 }))!;
    assert.equal(log.ok, true);
    assert.match(log.text ?? "", /tool\.result/);
    assert.match(log.text ?? "", /write_file/);
    assert.doesNotMatch(log.text ?? "", /sk-1234567890/);

    const status = (await caps.chief.roleStatus!({ roleId: "worker" }))!;
    assert.equal(status.ok, true);
    assert.match(status.text ?? "", /lastActivityAt=/);

    const invalid = (await caps.chief.roleActivityLog!({ roleId: "" }))!;
    assert.equal(invalid.ok, false);
  } finally {
    await mgr.stop(null);
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("工具注册面：幕僚注入 role_activity_log/terminate_role_run/redispatch_task；未注入即不存在", () => {
  const gate = (() => ({ allowed: false, reason: "test", allowedByRoot: {} })) as unknown as WriteGate;
  const names = (options: Record<string, unknown>) => new Set(buildGovernedTools(gate, options as never).map((tool) => tool.name));
  const withCaps = names({
    roleId: "chief",
    runtime: "demo",
    roleActivityLog: async () => ({ ok: true, text: "日志" }),
    terminateRoleRun: async () => ({ ok: true, terminationConfirmed: true, childProcesses: 0, childProcessesStopped: 0 }),
    redispatchTask: async () => ({ ok: false, safety: "unsafe", autoAllowed: false, message: "不重派" }),
  });
  assert.equal(withCaps.has("role_activity_log"), true);
  assert.equal(withCaps.has("terminate_role_run"), true);
  assert.equal(withCaps.has("redispatch_task"), true);
  const without = names({ roleId: "chief", runtime: "demo" });
  assert.equal(without.has("role_activity_log"), false);
  assert.equal(without.has("terminate_role_run"), false);
  assert.equal(without.has("redispatch_task"), false);
});
