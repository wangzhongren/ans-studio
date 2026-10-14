// test/编排/session-abort-images.test.ts
// 会话句柄两处新增（产品提案，2026-10-13 客户批准）：
//   - P0-2「停当前轮次」：RoleSessionHandle.abort?() 三态（可选方法，同契约 RoleSession.abort? 先例；
//     openRoleSession 的句柄恒实现——缺席只出现在替身）——
//       ① 底层会话有 abort ⇒ 透传，{ok:true, supported:true}，**不销毁会话**（下一条照发）；
//       ② 底层会话不带 abort（demo 替身/假适配器）⇒ {ok:false, supported:false}，如实文案
//          「当前运行时不支持停止」，绝不假装已停；
//       ③ SDK 报错 ⇒ {ok:false, supported:true, error:<错误原文>}——如实转达，不吞。
//   - P0-1「图片随消息送进模型」：send(text, opts?) 把 opts **原样透传**给底层会话
//     prompt(text, opts)（含空数组=无图；同一引用不克隆）；不传 opts 时调用形态逐字不变
//     （恰 1 个实参）。
// 全程桩适配器，不触网；abort 语义的底层实现（Pi SDK）归 Pi适配器测试，此处钉句柄层契约。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type {
  RuntimeAdapter,
  RoleSession,
  PromptOptions,
  PromptImage,
  SessionEvent,
  WriteGate,
} from "../../src/provider/pi/session.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";

// —— 夹具：临时项目（角色 X + 边界条目 src/thing.ts）——
function makeTempProject(entryPath = "src/thing.ts"): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-abort-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    `role: X\nentries:\n  - kind: file\n    path: ${entryPath}\n    purpose: 测试条目\n`
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: {
      path: "角色卡/X/boundary.yaml",
      acceptance: { accepted: true, source: "test:fixture" },
    },
  };
}

// —— 桩：记录 prompt 的**实参形状**（含实参个数）、abort/dispose 次数 ——
interface ProbeState {
  promptArgs: unknown[][];
  aborts: number;
  disposes: number;
}

/**
 * 底层会话可配置是否带 abort（契约 `RoleSession.abort?` 为可选方法——demo 替身可以不带）。
 * `abort` 不给 ⇒ 会话对象上无该字段（supported:false 的触发形状）。
 */
function makeDeps(opts?: {
  abort?: () => Promise<void> | void;
}): { deps: { createAdapter: (gate: WriteGate) => RuntimeAdapter }; state: ProbeState } {
  const state: ProbeState = { promptArgs: [], aborts: 0, disposes: 0 };
  const session: RoleSession = {
    async prompt(...args: Parameters<RoleSession["prompt"]>): Promise<void> {
      state.promptArgs.push(args); // 原样记录实参（个数/值/引用），供逐字断言
    },
    events(): AsyncIterable<SessionEvent> {
      return (async function* () {
        /* 桩不产出事件 */
      })();
    },
    async dispose(): Promise<void> {
      state.disposes += 1;
    },
    ...(opts?.abort !== undefined
      ? {
          abort(): Promise<void> | void {
            state.aborts += 1;
            return opts.abort!();
          },
        }
      : {}),
  };
  const adapter: RuntimeAdapter = {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(): Promise<RoleSession> {
      return session; // 底层同一会话对象
    },
  };
  return { deps: { createAdapter: (): RuntimeAdapter => adapter }, state };
}

const cleanup = (p: ProjectConfig): void => fs.rmSync(p.projectRoot, { recursive: true, force: true });

const IMG: PromptImage = { type: "image", data: "aGk=", mimeType: "image/png" };

// —————————————— P0-2：abort 三态 ——————————————

test("P0-2 abort：会话有 abort ⇒ 透传（ok:true supported:true），不销毁会话，下一条照发", async () => {
  const project = makeTempProject();
  const { deps, state } = makeDeps({
    abort: () => Promise.resolve(), // 异步 abort（真适配器形状）
  });
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    assert.equal(typeof handle.abort, "function"); // openRoleSession 的句柄**恒实现** abort（钉住）
    const res = await handle.abort?.();
    assert.deepEqual(res, { ok: true, supported: true });
    assert.equal(state.aborts, 1);
    assert.equal(state.disposes, 0); // **不销毁**：abort ≠ dispose
    await handle.send("下一轮"); // 会话仍可用
    assert.equal(state.promptArgs.length, 1);
    assert.equal(state.promptArgs[0][0], "下一轮");
  } finally {
    cleanup(project);
  }
});

test("P0-2 abort：会话 abort 为同步 void（契约允许 Promise<void>|void）⇒ ok:true supported:true", async () => {
  const project = makeTempProject();
  const { deps, state } = makeDeps({
    abort: () => {
      /* 同步完成，无返回值 */
    },
  });
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    const res = await handle.abort?.();
    assert.deepEqual(res, { ok: true, supported: true });
    assert.equal(state.aborts, 1);
    assert.equal(state.disposes, 0);
  } finally {
    cleanup(project);
  }
});

test("P0-2 abort：会话不带 abort（demo 替身形状）⇒ supported:false，如实文案，绝不假装已停", async () => {
  const project = makeTempProject();
  const { deps, state } = makeDeps(); // 不带 abort——会话对象上无该字段
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    const res = await handle.abort?.();
    assert.deepEqual(res, { ok: false, supported: false, error: "当前运行时不支持停止" });
    assert.equal(state.disposes, 0); // 未销毁
    await handle.send("仍可继续"); // 如实告知 ≠ 拒绝对话
    assert.equal(state.promptArgs.length, 1);
    assert.equal(state.promptArgs[0][0], "仍可继续");
  } finally {
    cleanup(project);
  }
});

test("P0-2 abort：SDK 报错 ⇒ ok:false supported:true，error 为错误原文（不吞、不谎报）", async () => {
  const project = makeTempProject();
  const { deps, state } = makeDeps({
    abort: () => {
      throw new Error("SDK 网关拒绝：内部错误");
    },
  });
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    const res = await handle.abort?.();
    assert.deepEqual(res, { ok: false, supported: true, error: "SDK 网关拒绝：内部错误" });
    assert.equal(state.disposes, 0); // 报错也不销毁
  } finally {
    cleanup(project);
  }
});

test("P0-2 abort：假适配器（createFakeRuntimeAdapter，无 abort 字段）端到端 ⇒ supported:false 如实", async () => {
  const project = makeTempProject();
  try {
    const handle = await openRoleSession(
      { roleId: "X", project },
      { createAdapter: (gate) => createFakeRuntimeAdapter({ gate, script: [] }) }
    );
    const res = await handle.abort?.();
    assert.deepEqual(res, { ok: false, supported: false, error: "当前运行时不支持停止" });
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

// —————————————— P0-1：send 透传图片 ——————————————

test("P0-1 send：opts 原样透传给 prompt(text, opts)——逐字相等且同一引用（不克隆）", async () => {
  const project = makeTempProject();
  const { deps, state } = makeDeps();
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    const opts: PromptOptions = { images: [IMG] };
    await handle.send("这是界面截图，请说明问题", opts);
    assert.equal(state.promptArgs.length, 1);
    const args = state.promptArgs[0];
    assert.equal(args.length, 2);
    assert.equal(args[0], "这是界面截图，请说明问题");
    assert.deepEqual(args[1], { images: [{ type: "image", data: "aGk=", mimeType: "image/png" }] });
    assert.equal(args[1], opts); // 同一引用：整包原样透传
  } finally {
    cleanup(project);
  }
});

test("P0-1 send：空数组 = 无图，同样原样透传（不吞字段）", async () => {
  const project = makeTempProject();
  const { deps, state } = makeDeps();
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    await handle.send("无图", { images: [] });
    const args = state.promptArgs[0];
    assert.equal(args.length, 2);
    assert.deepEqual(args[1], { images: [] });
  } finally {
    cleanup(project);
  }
});

test("P0-1 send：不传 opts ⇒ 旧行为逐字不变（prompt 恰 1 个实参）", async () => {
  const project = makeTempProject();
  const { deps, state } = makeDeps();
  try {
    const handle = await openRoleSession({ roleId: "X", project }, deps);
    await handle.send("纯文本一轮");
    assert.equal(state.promptArgs.length, 1);
    const args = state.promptArgs[0];
    assert.equal(args.length, 1); // 调用形态与旧版逐字一致：仅 text 一个实参
    assert.equal(args[0], "纯文本一轮");
  } finally {
    cleanup(project);
  }
});

test("逐轮来源只由编排消费，真实ACK链回一次且图片数组原引用保留", async () => {
  const project = makeTempProject();
  const images = [IMG];
  let received: PromptOptions | undefined;
  let callbackCount = 0;
  const adapter: RuntimeAdapter = {
    async composeContext() { return { systemPrompt: "" }; },
    async bindRole() {
      return {
        runtime: "pi",
        async prompt(_text, opts) {
          received = opts;
          const ack = { turnId: "real-turn", runtime: "pi" as const, roleId: "X" };
          opts?.onTurnStarted?.(ack);
          opts?.onTurnStarted?.(ack);
        },
        async *events() { yield { kind: "settled" as const, summary: "done", turnId: "real-turn" }; },
        async dispose() {},
      };
    },
  };
  const handle = await openRoleSession({ roleId: "X", project }, { createAdapter: () => adapter });
  try {
    await handle.send("图片任务", { images, handback: { required: true, taskId: "IMAGE" }, onTurnStarted: metadata => {
      callbackCount += 1;
      assert.equal(metadata.turnId, "real-turn");
    } });
    assert.equal(received?.images, images);
    assert.ok(received && !("handback" in received));
    assert.equal(callbackCount, 1);
    const reports = [];
    for await (const event of handle.events()) if (event.kind === "handback") reports.push(event.handback);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].taskId, "IMAGE");
  } finally { await handle.dispose(); cleanup(project); }
});
