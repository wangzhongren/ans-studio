// test/编排/session-lifecycle.test.ts
// 会话生命周期测试：runRole 必须**确实收敛并返回**（不留下未 resolve 的 promise），
// 并且无论成功/失败/异常都 dispose() 释放会话；dispose 出错如实报但不掩盖原始结果。
// 另覆盖：任务提示词含指向 writeSet 内真实可写文件的具体改动要求。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { TaskScope } from "../../src/model/decision.ts";
import type { RuntimeAdapter, RoleSession, SessionEvent } from "../../src/provider/pi/session.ts";
import { runRole } from "../../src/pipeline/orchestration/run-role.ts";
import { EXIT_OK, EXIT_FAILURE } from "../../src/common/编排/exit-codes.ts";

const TIMEOUT = { timeout: 3000 };

function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-lifecycle-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/interface/cli/run.ts\n    purpose: 测试条目\n"
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
const scopeX = (): TaskScope => ({ writeSet: ["src/interface/cli/run.ts"], conditions: [] });

// —— 可控假适配器：模拟真实 Pi 适配器的“事件流不自行结束”等行为 ——
interface Hooks {
  events: "settle-then-hang" | "settle-then-end" | "empty-end";
  promptThrows?: boolean;
  disposeThrows?: boolean;
  onPrompt?: (text: string) => void;
  onDispose?: () => void;
}
function makeAdapter(hooks: Hooks): RuntimeAdapter {
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(): Promise<RoleSession> {
      return {
        async prompt(text: string): Promise<void> {
          hooks.onPrompt?.(text);
          if (hooks.promptThrows) throw new Error("prompt 故意失败");
        },
        events(): AsyncIterable<SessionEvent> {
          let i = 0;
          const settled: SessionEvent = { kind: "settled", summary: "完成" };
          return {
            [Symbol.asyncIterator](): AsyncIterator<SessionEvent> {
              return {
                async next(): Promise<IteratorResult<SessionEvent>> {
                  if (hooks.events === "empty-end") {
                    return { value: undefined as unknown as SessionEvent, done: true };
                  }
                  i += 1;
                  if (i === 1) return { value: settled, done: false };
                  if (hooks.events === "settle-then-end") {
                    return { value: undefined as unknown as SessionEvent, done: true };
                  }
                  // settle-then-hang：永不再 resolve（模拟真实适配器：仅 dispose 时 close 队列）。
                  return new Promise<IteratorResult<SessionEvent>>(() => {});
                },
              };
            },
          };
        },
        async dispose(): Promise<void> {
          hooks.onDispose?.();
          if (hooks.disposeThrows) throw new Error("dispose 故意失败");
        },
      };
    },
  };
}

test("runRole 在事件流不自行结束时仍收敛返回（以 settled 为终止信号）", TIMEOUT, async () => {
  const project = makeTempProject();
  let disposed = 0;
  try {
    const r = await runRole(
      { roleId: "X", taskId: "T-1", project, scope: scopeX() },
      { createAdapter: () => makeAdapter({ events: "settle-then-hang", onDispose: () => (disposed += 1) }) }
    );
    assert.equal(r.code, EXIT_OK);
    assert.equal(disposed, 1); // 会话被释放
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("runRole 事件流自然结束（含 settled）也收敛，并 dispose 一次", TIMEOUT, async () => {
  const project = makeTempProject();
  let disposed = 0;
  try {
    const r = await runRole(
      { roleId: "X", taskId: "T-1", project, scope: scopeX() },
      { createAdapter: () => makeAdapter({ events: "settle-then-end", onDispose: () => (disposed += 1) }) }
    );
    assert.equal(r.code, EXIT_OK);
    assert.equal(disposed, 1);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("runRole 异常路径（prompt 抛错）→ 非 0，且仍 dispose", TIMEOUT, async () => {
  const project = makeTempProject();
  let disposed = 0;
  try {
    const r = await runRole(
      { roleId: "X", taskId: "T-1", project, scope: scopeX() },
      {
        createAdapter: () =>
          makeAdapter({ events: "settle-then-end", promptThrows: true, onDispose: () => (disposed += 1) }),
      }
    );
    assert.equal(r.code, EXIT_FAILURE);
    assert.equal(disposed, 1);
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("runRole dispose 出错：如实报并非 0（原成功被翻为失败）", TIMEOUT, async () => {
  const project = makeTempProject();
  try {
    const r = await runRole(
      { roleId: "X", taskId: "T-1", project, scope: scopeX() },
      { createAdapter: () => makeAdapter({ events: "settle-then-end", disposeThrows: true }) }
    );
    assert.equal(r.code, EXIT_FAILURE);
    assert.ok(r.transcript.some((e) => /释放会话失败/.test(e.summary)));
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("runRole dispose 出错不掩盖原始错误（原已失败仍为非 0）", TIMEOUT, async () => {
  const project = makeTempProject();
  try {
    const r = await runRole(
      { roleId: "X", taskId: "T-1", project, scope: scopeX() },
      { createAdapter: () => makeAdapter({ events: "settle-then-end", promptThrows: true, disposeThrows: true }) }
    );
    assert.equal(r.code, EXIT_FAILURE);
    assert.ok(r.transcript.some((e) => /会话异常/.test(e.summary)));
    assert.ok(r.transcript.some((e) => /释放会话失败/.test(e.summary)));
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("runRole 适配器构造期抛错（如缺 provider 配置）→ 非 0，无会话可释放", TIMEOUT, async () => {
  const project = makeTempProject();
  try {
    const r = await runRole(
      { roleId: "X", taskId: "T-1", project, scope: scopeX() },
      {
        createAdapter: () => {
          throw new Error("缺少 base URL：测试构造失败");
        },
      }
    );
    assert.equal(r.code, EXIT_FAILURE);
    assert.ok(r.transcript.some((e) => /会话异常/.test(e.summary)));
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});

test("runRole 任务提示词含指向 writeSet 内文件的**具体改动要求**", TIMEOUT, async () => {
  const project = makeTempProject();
  let promptText = "";
  try {
    await runRole(
      { roleId: "X", taskId: "T-1", project, scope: scopeX() },
      { createAdapter: () => makeAdapter({ events: "settle-then-end", onPrompt: (t) => (promptText = t) }) }
    );
    assert.match(promptText, /T-1/);
    assert.match(promptText, /src\/interface\/cli\/run\.ts/); // writeSet 内真实可写文件
    assert.match(promptText, /write_file|edit_file/); // 要求实际发起写入
  } finally {
    fs.rmSync(project.projectRoot, { recursive: true, force: true });
  }
});
