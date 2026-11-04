// test/编排/run-role-submit-capabilities.test.ts
// S5/Batch 3.5：run-role 三提交能力（submit_version_change / submit_refactor /
// request_stable_write）的**角色门控注入**测试——
// · product/rapporteur → 仅 submitVersionChange；convener → submitRefactor + requestStableWrite；
// · 其他治理角色/项目角色 ⇒ 一律不注入（工具不注册，fail-closed）；未注入 ⇒ 字段缺席；
// · 注入即同一引用（不包装、不调用；工具层保证「恰好一次」与回执透传，C1d 测试覆盖）；
// · run-role 不批准/不发许可/不写账本（能力实现由 D1b 注入 S4/S2）。

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RequestStableWriteFn,
  RoleSession,
  RuntimeAdapter,
  SessionEvent,
  SubmitRefactorFn,
  SubmitVersionChangeFn,
  WriteGate,
} from "../../src/model/runtime.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";

interface Captured {
  gate?: WriteGate;
  caps?: AdapterCapabilities;
}

function capturingFactory(captured: Captured) {
  return (gate: WriteGate, caps?: AdapterCapabilities): RuntimeAdapter => {
    captured.gate = gate;
    captured.caps = caps;
    const session: RoleSession = {
      async prompt(): Promise<void> {},
      events(): AsyncIterable<SessionEvent> {
        return (async function* () {
          yield { kind: "settled" as const, summary: "完成" };
        })();
      },
      async dispose(): Promise<void> {},
    };
    return {
      async composeContext() {
        return { systemPrompt: "" };
      },
      async bindRole(): Promise<RoleSession> {
        return session;
      },
    };
  };
}

const submitVersionChange: SubmitVersionChangeFn = async () => ({
  ok: true,
  applicationId: "vc-1",
  status: "submitted",
});
const submitRefactor: SubmitRefactorFn = async () => ({ ok: true, requestId: "rf-1", status: "requested" });
const requestStableWrite: RequestStableWriteFn = async () => ({ ok: true, requestId: "sw-1", status: "requested" });

async function withRoot<T>(fn: (root: string) => Promise<T>): Promise<T> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-submit-caps-"));
  try {
    return await fn(root);
  } finally {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

function trioProject(root: string, builtInRoleId: string): ProjectConfig {
  return {
    projectRoot: root,
    skillRoot: root,
    roles: {},
    governanceModel: "trio",
    builtInRoles: [builtInRoleId],
    governanceBoundary: {
      path: "角色卡/governance-boundary.yaml",
      acceptance: { accepted: true, source: "test:submit-caps" },
    },
  };
}

function writeFile(root: string, rel: string, text: string): void {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, "utf8");
}

function projectRole(root: string): ProjectConfig {
  writeFile(root, "角色卡/X/role-card.md", "# 角色 X\n");
  writeFile(root, "角色卡/X/boundary.yaml", "role: X\nentries:\n  - kind: directory\n    path: src/\n    purpose: 实现\n");
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: {
      path: "角色卡/X/boundary.yaml",
      acceptance: { accepted: true, source: "test:submit-caps" },
    },
  };
}

const ALL = { submitVersionChange, submitRefactor, requestStableWrite };

test("run-role 能力注入：product → 仅 submitVersionChange；rapporteur 同；convener → refactor+stable；chief 全无", async () => {
  await withRoot(async (root) => {
    const matrix: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["product", ["submitVersionChange"]],
      ["rapporteur", ["submitVersionChange"]],
      ["convener", ["submitRefactor", "requestStableWrite"]],
      ["chief", []],
      ["nominator", []],
    ];
    for (const [roleId, expected] of matrix) {
      const captured: Captured = {};
      const handle = await openRoleSession(
        { roleId, project: trioProject(root, roleId), ...ALL },
        { createAdapter: capturingFactory(captured) },
      );
      try {
        const caps = captured.caps;
        assert.ok(caps !== undefined, `${roleId}: 应构造能力面`);
        const present = (["submitVersionChange", "submitRefactor", "requestStableWrite"] as const).filter(
          (key) => caps![key] !== undefined,
        );
        assert.deepEqual(present.sort(), [...expected].sort(), `${roleId} 能力面`);
        if (expected.includes("submitVersionChange")) {
          assert.equal(caps!.submitVersionChange, submitVersionChange, "注入同一引用（不包装）");
        }
        if (expected.includes("submitRefactor")) assert.equal(caps!.submitRefactor, submitRefactor);
        if (expected.includes("requestStableWrite")) assert.equal(caps!.requestStableWrite, requestStableWrite);
      } finally {
        await handle.dispose();
      }
    }
  });
});

test("run-role 能力注入：项目角色即便调用方误给也不注入三能力（模型自报角色不可信）", async () => {
  await withRoot(async (root) => {
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "X", project: projectRole(root), ...ALL },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      const caps = captured.caps;
      assert.ok(caps !== undefined);
      assert.equal(caps!.submitVersionChange, undefined);
      assert.equal(caps!.submitRefactor, undefined);
      assert.equal(caps!.requestStableWrite, undefined);
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role 能力注入：未注入 ⇒ 能力位缺席（工具不注册；无副作用）", async () => {
  await withRoot(async (root) => {
    const captured: Captured = {};
    const handle = await openRoleSession(
      { roleId: "product", project: trioProject(root, "product") },
      { createAdapter: capturingFactory(captured) },
    );
    try {
      assert.ok(captured.caps !== undefined);
      assert.equal(captured.caps!.submitVersionChange, undefined);
      assert.equal(captured.caps!.submitRefactor, undefined);
      assert.equal(captured.caps!.requestStableWrite, undefined);
    } finally {
      await handle.dispose();
    }
  });
});

test("run-role 能力注入：假实现的结构化回执形状（submitted/requested）由工具层透传（形状自检）", async () => {
  const vca = await submitVersionChange(
    {
      kind: "version-upgrade",
      initiatorRoleId: "product",
      flowId: "demo",
      summary: "x",
      targets: [{ kind: "contract", path: "docs/proposals/demo-proposal-v2.md", action: "add" }],
    },
    undefined,
  );
  assert.equal(vca.ok, true);
  assert.equal(vca.status, "submitted");
  const refactor = await submitRefactor(
    { roleId: "convener", flowId: "demo", title: "t", reason: "r", scope: { modules: [], paths: [], roles: [] } },
    undefined,
  );
  assert.equal(refactor.status, "requested");
  const stable = await requestStableWrite({ roleId: "convener", kind: "workflow", content: "# w\n" }, undefined);
  assert.equal(stable.status, "requested");
});
