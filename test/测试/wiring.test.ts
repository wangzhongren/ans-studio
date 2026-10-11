// 测试角色:跨角色接线 —— 独立确认
//  1) 编排用的是**装配注入**的配置(不是自己的副本):注入一份不同的 project/scope,
//     观察判定确实随注入值改变;缺注入则以非 0 清晰错误结束。
//  2) 判定来自**门禁引擎** resolveWrite(拒绝理由即其措辞),编排不自实现路径判定。
// 本测试不复制门禁引擎单测,只验证"接线"本身。

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runRole } from "../../src/pipeline/orchestration/run-role.ts";
import { runRoleCommand } from "../../src/interface/cli/run.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { TaskScope } from "../../src/model/decision.ts";
import type {
  RoleSession,
  RuntimeAdapter,
  WriteGate,
  SessionEvent,
} from "../../src/provider/pi/session.ts";
import { buildDemoProjectConfig } from "../../src/index.ts";

const ROOT = mkdtempSync(path.join(tmpdir(), "wiring-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

/** 一个只捕获 gate 的空适配器(不发事件、不落盘)。 */
function captureAdapter(sink: { gate?: WriteGate }): (gate: WriteGate) => RuntimeAdapter {
  return (gate) => {
    sink.gate = gate;
    const session: RoleSession = {
      async prompt(): Promise<void> {
        /* 无动作 */
      },
      events(): AsyncIterable<SessionEvent> {
        return {
          [Symbol.asyncIterator](): AsyncIterator<SessionEvent> {
            return { next: async () => ({ value: undefined as unknown as SessionEvent, done: true }) };
          },
        };
      },
      async dispose(): Promise<void> {
        /* 无资源 */
      },
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

test("接线:编排使用装配**注入**的 project/scope(注入一份不同的边界,判定随之改变)", async () => {
  // 注入一份与仓库真实 编排 边界**不同**的边界:只允许 src/custom.ts
  const rel = "角色卡/注入角色/boundary.yaml";
  const abs = path.join(ROOT, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(
    abs,
    "role: 编排\nentries:\n  - kind: file\n    path: src/custom.ts\n    purpose: 注入样本\n",
    "utf8",
  );
  // 角色卡也须在注入的 projectRoot 下真实存在(resolveRole 会读取它)
  const cardRel = "角色卡/注入角色/role-card.md";
  writeFileSync(path.join(ROOT, cardRel), "# 注入角色卡\n", "utf8");

  const project: ProjectConfig = {
    projectRoot: ROOT,
    skillRoot: path.join(ROOT, "skill"),
    roles: { 编排: { card: cardRel, boundary: rel } },
    governanceBoundary: { path: rel, acceptance: { accepted: true, source: "test:injected" } },
  };
  const scope: TaskScope = { writeSet: ["src/custom.ts"], conditions: [] };

  const sink: { gate?: WriteGate } = {};
  const result = await runRole({ roleId: "编排", taskId: "T-1", project, scope }, { createAdapter: captureAdapter(sink) });

  assert.equal(result.code, 0);
  assert.ok(sink.gate, "编排应向适配器注入 gate");

  // gate 的判定绑定的是**注入的**边界:src/custom.ts 允许、src/evil.ts 拒绝
  const allowed = sink.gate!("src/custom.ts");
  assert.equal(allowed.allowed, true, "注入边界内的路径应允许(证明用了注入配置)");
  const denied = sink.gate!("src/evil.ts");
  assert.equal(denied.allowed, false, "注入边界外的路径应拒绝");

  // 拒绝理由来自门禁引擎的措辞(未匹配任何边界条目),编排不自实现判定
  assert.match((denied as { reason: string }).reason, /未匹配任何边界条目/);
});

test("接线:runRoleCommand 缺 project 注入 → 非 0(EXIT_USAGE),不自回退第二份配置", async () => {
  const sink: { gate?: WriteGate } = {};
  // 只给 createAdapter,不给 project/scope —— 模拟"装配未注入"。
  const code = await runRoleCommand(["role", "run", "编排", "--task", "T-1"], {
    createAdapter: captureAdapter(sink),
  } as { createAdapter: (gate: WriteGate) => RuntimeAdapter });
  assert.equal(code, 2, "缺注入应以 EXIT_USAGE(2) 结束");
  assert.equal(sink.gate, undefined, "缺配置时不应构造 gate/会话");
});

test("接线:门禁引擎的 F4 收窄经真实装配配置生效(判定来自 resolveWrite)", async () => {
  // 用真实装配配置,注入一个把 src/interface/cli/run.ts 排除在外的 writeSet
  const project = buildDemoProjectConfig();
  const scope: TaskScope = { writeSet: [], conditions: [] };
  const sink: { gate?: WriteGate } = {};
  const result = await runRole({ roleId: "编排", taskId: "T-1", project, scope }, { createAdapter: captureAdapter(sink) });

  assert.equal(result.code, 0);
  const d = sink.gate!("src/interface/cli/run.ts"); // 在 编排 边界内
  assert.equal(d.allowed, false);
  assert.match((d as { reason: string }).reason, /F4/);
});
