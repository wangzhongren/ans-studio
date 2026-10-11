// test/编排/handback.test.ts
// 编排角色自测：`TaskHandback`（角色完成回交 su，设计 §10.8）。
// 覆盖：形状（buildTaskHandback）；`withHandback` 在 settled 时**先**发 handback 再透传 settled；
//       经 `openRoleSession` 端到端——普通角色 settle → 发出 handback；**内置治理角色（su）不自我回交**。
// 全程桩/假适配器，不触网、不落盘（writeRoot 缺省）。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { SessionEvent } from "../../src/provider/pi/session.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import {
  buildTaskHandback,
  withHandback,
  type OrchestrationEvent,
  type HandbackEvent,
} from "../../src/common/编排/handback.ts";

// —— 夹具：临时项目（角色 X + 边界条目 src/thing.ts）——
function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-handback-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/thing.ts\n    purpose: 测试条目\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:fixture" } },
  };
}
const cleanup = (p: ProjectConfig): void => fs.rmSync(p.projectRoot, { recursive: true, force: true });

function isHandback(ev: OrchestrationEvent): ev is HandbackEvent {
  return ev.kind === "handback";
}

// —— 形状：buildTaskHandback ——

test("buildTaskHandback：形状正确（roleId/taskId/status/summary/evidence/at）", () => {
  const events: SessionEvent[] = [
    { kind: "tool_call", summary: "请求 write_file -> src/thing.ts" },
    { kind: "accepted", summary: "write_file 已获准（写入）：src/thing.ts" },
    { kind: "settled", summary: "会话结束" },
  ];
  const hb = buildTaskHandback(events, { roleId: "X", taskId: "T-9", now: () => new Date("2026-10-11T00:00:00.000Z") });
  assert.equal(hb.roleId, "X");
  assert.equal(hb.taskId, "T-9");
  assert.equal(hb.status, "completed");
  assert.equal(hb.summary, "会话结束");
  assert.deepEqual(hb.evidence, ["write_file 已获准（写入）：src/thing.ts"]);
  assert.equal(hb.at, "2026-10-11T00:00:00.000Z");
});

test("buildTaskHandback：无写入被接受且有拒绝 → blocked；无 taskId 时省略该字段", () => {
  const blocked = buildTaskHandback(
    [{ kind: "denied", summary: "拒绝写入 src/evil.ts" }, { kind: "settled", summary: "会话结束" }],
    { roleId: "X" },
  );
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.taskId, undefined, "无 taskId 时不应带该字段");
  assert.deepEqual(blocked.evidence, []);

  // 显式覆盖 status。
  const forced = buildTaskHandback([{ kind: "settled", summary: "完成" }], { roleId: "X", status: "completed" });
  assert.equal(forced.status, "completed");
});

// —— withHandback：透传 + settled 前发 handback ——

test("withHandback：透传 SessionEvent；在 settled **之前**发 handback 事件", async () => {
  const src: SessionEvent[] = [
    { kind: "tool_call", summary: "t" },
    { kind: "accepted", summary: "a" },
    { kind: "settled", summary: "完成" },
  ];
  async function* gen(): AsyncIterable<SessionEvent> {
    for (const e of src) yield e;
  }
  const out: OrchestrationEvent[] = [];
  for await (const ev of withHandback(gen(), { roleId: "X", taskId: "T-1" })) out.push(ev);

  assert.equal(out.length, 4, "3 条会话事件 + 1 条 handback");
  const hbIndex = out.findIndex(isHandback);
  const settledIndex = out.findIndex((e) => e.kind === "settled");
  assert.ok(hbIndex >= 0, "应发出 handback 事件");
  assert.ok(hbIndex < settledIndex, "handback 应在 settled **之前**（以 settled 为终止信号的消费方才收得到）");
  const hb = (out[hbIndex] as HandbackEvent).handback;
  assert.equal(hb.roleId, "X");
  assert.equal(hb.status, "completed");
});

// —— 端到端：普通角色 settle → handback；治理角色不自我回交 ——

test("openRoleSession：普通角色 settle → 发出 handback（形状正确）", async () => {
  const project = makeTempProject();
  try {
    const handle = await openRoleSession(
      { roleId: "X", project, taskId: "T-1" },
      {
        createAdapter: (gate) =>
          createFakeRuntimeAdapter({
            gate,
            script: [{ name: "write_file", args: { path: "src/thing.ts", content: "// x\n" } }],
          }),
      },
    );
    await handle.send("做点事");
    const events: OrchestrationEvent[] = [];
    for await (const ev of handle.events()) events.push(ev);

    const hbs = events.filter(isHandback).map((e) => e.handback);
    assert.equal(hbs.length, 1, "普通角色会话应在 settle 时回交一次");
    assert.equal(hbs[0].roleId, "X");
    assert.equal(hbs[0].taskId, "T-1");
    assert.equal(hbs[0].status, "completed");
    assert.equal(typeof hbs[0].at, "string");
    assert.ok(Array.isArray(hbs[0].evidence));
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

test("openRoleSession：内置治理角色（su）→ **不**自我回交（事件流无 handback）", async () => {
  const project = makeTempProject();
  project.builtInRoles = ["su"];
  try {
    const handle = await openRoleSession(
      { roleId: "su", project },
      {
        createAdapter: (gate) =>
          createFakeRuntimeAdapter({ gate, script: [{ name: "write_file", args: { path: "src/thing.ts", content: "// x\n" } }] }),
      },
    );
    await handle.send("以治理身份工作");
    const events: OrchestrationEvent[] = [];
    for await (const ev of handle.events()) events.push(ev);
    assert.equal(events.filter(isHandback).length, 0, "治理角色不回交给自己");
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});
