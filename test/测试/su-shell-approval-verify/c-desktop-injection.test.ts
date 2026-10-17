// test/测试/su-shell-approval-verify/c-desktop-injection.test.ts
// 测试角色：su 命令审批策略——**桌面窗口注入**独立验证（2026-10-17）。
//
// 覆盖 PM 评审 §3.5：
//   · su 收 `shellOperatorOnly`（含同一份 classifyShell/rules + 每会话闭包 channel）且**不再收**
//     `shellReadonly`；也不把 (a) 通道放在顶层 `shellOperatorChannel`（避免同时走三层链）；
//   · 项目角色仍收 `shellOperatorChannel` + `shellArming`（三层链逐字不变）；
//   · 缺 `shellArming` 或缺 `shellOperatorChannel` ⇒ su **不传** `shellOperatorOnly`（不 arm）。
//
// 独立构造：假 `openRoleSession` 捕获桌面实际传入的形状；真实 `listProject`/`buildProjectConfig`。

import { test } from "node:test";
import assert from "node:assert/strict";

import { SessionManager } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import { classifyShell, defaultShellRules } from "../../../src/service/gate/shell-rules.ts";
import type { RoleSessionHandle } from "../../../src/pipeline/orchestration/run-role.ts";
import type { SessionEvent } from "../../../src/provider/pi/session.ts";
import type { RuntimeAdapter } from "../../../src/model/runtime.ts";
import { makeTempProject } from "./fixture.ts";

type CapturedInput = Record<string, unknown>;

const dummyAdapter: RuntimeAdapter = {
  async composeContext() {
    return { systemPrompt: "" };
  },
  async bindRole() {
    return makeSession();
  },
};

function makeSession() {
  return {
    async prompt(): Promise<void> {},
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              return { done: true, value: undefined as unknown as SessionEvent };
            },
          };
        },
      };
    },
    async dispose(): Promise<void> {},
  };
}

function makeHandle(): RoleSessionHandle {
  return {
    runtime: "pi",
    async send() {},
    events(): AsyncIterable<SessionEvent> {
      return {
        [Symbol.asyncIterator]() {
          return {
            async next(): Promise<IteratorResult<SessionEvent>> {
              return { done: true, value: undefined as unknown as SessionEvent };
            },
          };
        },
      };
    },
    async dispose() {},
  };
}

interface Harness {
  captured: Record<string, unknown>[];
  mgr: SessionManager;
  root: string;
  cleanup(): void;
}

async function makeHarness(opts: {
  withArming: boolean;
  withChannel: boolean;
}): Promise<Harness> {
  const fx = makeTempProject();
  const listing = await listProject(fx.root);
  const captured: CapturedInput[] = [];
  const mgr = new SessionManager({
    openRoleSession: async (input) => {
      captured.push(input as unknown as CapturedInput);
      return makeHandle();
    },
    createPiAdapterFactory: () => () => dummyAdapter,
    createDemoAdapter: () => dummyAdapter,
    getListing: (root: string) => (root === listing.projectRoot ? listing : undefined),
    buildProjectConfig,
    emitEvent: () => {},
    ...(opts.withArming ? { shellArming: { classifyShell, rules: defaultShellRules } } : {}),
    ...(opts.withChannel
      ? { shellOperatorChannel: async () => ({ outcome: "deny" as const, operatorId: "独立验证" }) }
      : {}),
  });
  return {
    captured,
    mgr,
    root: fx.root,
    cleanup: fx.cleanup,
  };
}

test("C1 桌面注入：su 收 shellOperatorOnly（含 (c)+(a)）、不收 shellReadonly/顶层通道；项目角色三层链不变", async () => {
  const h = await makeHarness({ withArming: true, withChannel: true });
  try {
    const suOpen = await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "pi" });
    assert.equal(suOpen.ok, true, JSON.stringify(suOpen));
    const su = h.captured[0];
    const suOnly = su.shellOperatorOnly as Record<string, unknown> | undefined;
    assert.ok(suOnly, "su 必须收到 shellOperatorOnly");
    assert.equal(typeof suOnly.operatorChannel, "function");
    assert.equal(typeof suOnly.classifyShell, "function");
    assert.ok(suOnly.rules, "rules 与项目角色同一份 deps.shellArming");
    assert.equal(su.shellReadonly, undefined, "桌面不再给 su 传旧只读档");
    assert.equal(su.shellOperatorChannel, undefined, "su 的 (a) 只在 shellOperatorOnly 内，不并走三层链");

    const xOpen = await h.mgr.open({ projectRoot: h.root, roleId: "X", runtime: "pi" });
    assert.equal(xOpen.ok, true, JSON.stringify(xOpen));
    const x = h.captured[1];
    assert.equal(typeof x.shellOperatorChannel, "function", "项目角色仍走 (a) 通道");
    assert.ok(x.shellArming, "项目角色仍走 (c) 实件");
    assert.equal(x.shellOperatorOnly, undefined, "项目角色不得收审批档");
    assert.equal(x.shellReadonly, undefined);
  } finally {
    h.cleanup();
  }
});

test("C2 缺件不 arm：缺 shellArming 或缺 shellOperatorChannel ⇒ su 不传 shellOperatorOnly", async () => {
  const noArming = await makeHarness({ withArming: false, withChannel: true });
  try {
    await noArming.mgr.open({ projectRoot: noArming.root, roleId: "su", runtime: "pi" });
    assert.equal(noArming.captured[0].shellOperatorOnly, undefined, "缺 (c) 实件 ⇒ 不 arm");
  } finally {
    noArming.cleanup();
  }

  const noChannel = await makeHarness({ withArming: true, withChannel: false });
  try {
    await noChannel.mgr.open({ projectRoot: noChannel.root, roleId: "su", runtime: "pi" });
    assert.equal(noChannel.captured[0].shellOperatorOnly, undefined, "缺 (a) 通道 ⇒ 不 arm");
  } finally {
    noChannel.cleanup();
  }
});
