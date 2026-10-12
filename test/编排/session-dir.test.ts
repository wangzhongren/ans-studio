// test/编排/session-dir.test.ts
// 编排角色自测：**D-1 重启恢复（编排部分）**——会话自持目录的**路径计算与传参**。
// 设计稿 `2026-10-12_design_governed-interaction-and-chat-ux.md` §D-1（存储＝项目内，客户已定）。
//
// 约定与决策（本文件钉死）：
//   · 路径 = `<projectRoot>/.ans/sessions/<roleId>/`（含尾分隔符）；经能力面
//     `deps.createAdapter(gate, { sessionDir })` 传给适配器（「注入才注册」同族）。
//   · **编排只算路径、不预建目录**——目录创建归适配器在真正落盘时做（保「不预建 `.ans`」既有
//     语义/断言；避免空目录）——测试**反向断言** openRoleSession 后该目录**不存在**。
//   · projectRoot 为空 / roleId 不安全（空、含 `/`、`\`、`..`）→ **不传**（旧行为）。
//   · 每个角色会话都拿到（含治理角色 su——「对每个角色」）；一次性路径 `runRole` **不传**。
// 全程桩适配器，不触网、不落盘（桩不实现任何写）。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent, WriteGate } from "../../src/provider/pi/session.ts";
import { openRoleSession, runRole } from "../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";

/** 临时项目（角色 X + 边界文件；可选 builtInRoles）。 */
function makeTempProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-sessiondir-"));
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

/** 捕获能力面的桩适配器工厂（方案同 handback.test.ts 的 stubAdapter）。 */
function stubAdapter(events: SessionEvent[] = [{ kind: "settled", summary: "会话结束" }]): {
  createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  caps: () => AdapterCapabilities | undefined;
  calls: Array<AdapterCapabilities | undefined>;
} {
  let captured: AdapterCapabilities | undefined;
  const calls: Array<AdapterCapabilities | undefined> = [];
  return {
    caps: () => captured,
    calls,
    createAdapter: (_gate, capabilities) => {
      captured = capabilities;
      calls.push(capabilities);
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(): Promise<void> {},
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                for (const e of events) yield e;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    },
  };
}

test("D-1：项目角色会话传入约定路径 `<projectRoot>/.ans/sessions/<roleId>/`；编排**不预建**目录", async () => {
  const project = makeTempProject();
  try {
    const stub = stubAdapter();
    const handle = await openRoleSession({ roleId: "X", project }, { createAdapter: stub.createAdapter });
    assert.equal(
      stub.caps()?.sessionDir,
      path.join(project.projectRoot, ".ans", "sessions", "X") + path.sep,
      "路径应等于约定值（含尾分隔符）",
    );
    // **反向断言**：编排只传路径、不建目录——创建归适配器在真正落盘时做（见本文件头与
    // AdapterCapabilities.sessionDir 注释：保「不预建 .ans」的既有语义/断言）。
    assert.equal(fs.existsSync(path.join(project.projectRoot, ".ans")), false, "编排不得预建 .ans/sessions/");
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

test("D-1：治理角色 su 的会话**同样**拿到 sessionDir（「对每个角色」）", async () => {
  const project = makeTempProject();
  project.builtInRoles = ["su"];
  try {
    const stub = stubAdapter();
    const handle = await openRoleSession({ roleId: "su", project }, { createAdapter: stub.createAdapter });
    assert.equal(
      stub.caps()?.sessionDir,
      path.join(project.projectRoot, ".ans", "sessions", "su") + path.sep,
      "su 会话也应持久化（重启恢复对每个角色生效）",
    );
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

test("D-1：projectRoot 为空 → 不传 sessionDir（旧行为）", async () => {
  // 最小项目：空 projectRoot + su（内置角色，不读角色卡/边界文件）→ 会话可开，但无持久化路径。
  const project: ProjectConfig = { projectRoot: "", skillRoot: "", roles: {}, builtInRoles: ["su"] };
  const stub = stubAdapter();
  const handle = await openRoleSession({ roleId: "su", project }, { createAdapter: stub.createAdapter });
  assert.equal(stub.caps()?.sessionDir, undefined, "无 projectRoot → 不传（旧行为）");
  await handle.dispose();
});

test("D-1：roleId 不安全（含路径分隔符 / ..）→ 不传 sessionDir（防御，防目录逃逸）", async () => {
  const project = makeTempProject();
  // 经 builtInRoles 让「未登记 id」可行走会话式入口（内置分支不读角色卡文件）——用一个含 `/` 与 `..` 的 id。
  project.builtInRoles = ["su/../evil"];
  try {
    const stub = stubAdapter();
    const handle = await openRoleSession({ roleId: "su/../evil", project }, { createAdapter: stub.createAdapter });
    assert.equal(stub.caps()?.sessionDir, undefined, "不安全 roleId → 拒绝构造会话目录（旧行为）");
    assert.equal(fs.existsSync(path.join(project.projectRoot, ".ans")), false);
    await handle.dispose();
  } finally {
    cleanup(project);
  }
});

test("D-1：一次性路径 runRole **不传**能力面（一局即止，无持久化/恢复语义）", async () => {
  const project = makeTempProject();
  try {
    const stub = stubAdapter();
    const result = await runRole(
      { roleId: "X", taskId: "T-1", project },
      { createAdapter: stub.createAdapter },
    );
    assert.equal(result.code, 0);
    assert.equal(stub.calls.length, 1, "runRole 应经 createAdapter 建一次适配器");
    assert.equal(stub.calls[0], undefined, "runRole（一次性路径）不传 AdapterCapabilities");
    assert.equal(fs.existsSync(path.join(project.projectRoot, ".ans")), false);
  } finally {
    cleanup(project);
  }
});
