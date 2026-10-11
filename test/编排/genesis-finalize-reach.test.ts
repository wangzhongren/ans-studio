// test/编排/genesis-finalize-reach.test.ts
// T36/T37：让**收口在桌面实际走的那条路（`openRoleSession`）上可达**，并钉死 T37 的**提议→确认**语义。
//
// 背景：桌面走 `openRoleSession`（不是 `openGovernanceSession`）。本文件钉死：
//   ① 可达性：`openRoleSession({ genesisFinalize: true })` 的句柄带 `settled` + `finalize()`；
//      注入确认通道（allow）→ `finalize()` **提议 → 确认 → 写出** `.ans` + 治理边界文档 + manifest；
//      pin 与文件实际 SHA-256 一致（测试独立重算比对）。
//   ② 守卫：会话尚未 settle → 拒绝；**非创世态**（.ans 已存在）→ 拒绝（不是静默）且零副作用。
//   ③ fail-closed：未注入确认通道（或通道不可用）→ 不完成（unavailable）且零副作用。
//   ④ 向后兼容：不开启 `genesisFinalize` → 句柄**无** `settled`/`finalize`（形状与行为不变）。
//   ⑤ 自动重 pin：确认后加角色 → 下一轮 settle 后 pin 自动纳入（桌面本条路径）——见 finalize.test.ts 亦有。
//
// 全部用系统临时目录，用后清理——不在仓库留文件。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { loadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import type { OperatorChannelFn, OperatorOutcome, WriteGate } from "../../src/provider/pi/session.ts";
import type { WriteDecision } from "../../src/model/decision.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent, ToolCall } from "../../src/provider/pi/session.ts";

const GOV_REL = "角色卡/governance-boundary.yaml";
const ANS_REL = ".ans/project.json";
const MANIFEST_REL = "docs/bootstrap-manifest.md";
const ROLE_X_BOUNDARY = "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: 测试角色条目\n";

/** su 在创世会话里写出的东西：角色 X 的三件套（治理边界文档由 finalize 写出）。 */
const GENESIS_SCRIPT: ToolCall[] = [
  { name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# 角色：X\n\n由 su 创世会话创建。\n" } },
  { name: "write_file", args: { path: "角色卡/X/boundary.yaml", content: ROLE_X_BOUNDARY } },
  { name: "write_file", args: { path: "角色卡/X/memo.md", content: "# X 备忘录\n" } },
];

async function withRoot<T>(fn: (ctx: { target: string }) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-fin-reach-"));
  try {
    return await fn({ target: join(root, "proj") });
  } finally {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略 */
    }
  }
}

function genesisProject(target: string): ProjectConfig {
  return {
    projectRoot: target,
    skillRoot: target,
    roles: {},
    builtInRoles: ["su"],
    genesisBootstrap: { source: "test:desktop 导入空项目=发起 bootstrap（操作者指令）" },
  };
}

/** 桩适配器：每轮 prompt 后、每次消费事件流即产出一个 `settled`（不写盘）。 */
function settledStubAdapter(): RuntimeAdapter {
  return {
    async composeContext() {
      return { systemPrompt: "" };
    },
    async bindRole(): Promise<RoleSession> {
      return {
        async prompt(): Promise<void> {},
        events(): AsyncIterable<SessionEvent> {
          return (async function* () {
            yield { kind: "settled", summary: "完成" } as SessionEvent;
          })();
        },
        async dispose(): Promise<void> {},
      };
    },
  };
}

const channelAllow: OperatorChannelFn = () => ({ outcome: "allow", operatorId: "test-客户" });

/** 全放行 gate（仅测试桩用）。 */
const allowGate = (() => ({ allowed: true }) as unknown as WriteDecision) as WriteGate;

function sha256Of(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

async function driveToSettled(handle: { events(): AsyncIterable<{ kind: string }> }): Promise<void> {
  for await (const ev of handle.events()) {
    if (ev.kind === "settled") break;
  }
}

// ————————— ① 可达性：桌面路径 + genesisFinalize + 确认通道 → 真写出 —————————

test("可达性：openRoleSession（桌面走的路）+ genesisFinalize + 确认通道 → finalize 真写出（pin 与实算一致）", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const handle = await openRoleSession(
      { roleId: "su", project: genesisProject(target), genesisFinalize: true, operatorChannel: channelAllow },
      { createAdapter: () => createFakeRuntimeAdapter({ gate: allowGate, script: GENESIS_SCRIPT, writeRoot: target }) },
    );
    assert.equal(typeof handle.finalize, "function", "开启后句柄应带 finalize()");
    assert.equal(handle.settled, false, "开跑前未 settle");

    await handle.send("请据对话创建角色 X");
    await driveToSettled(handle);
    assert.equal(handle.settled, true, "会话应已 settle");

    const res = await handle.finalize!();
    assert.equal(res.ok, true, `finalize 应完成：${res.message ?? ""}`);
    assert.equal(res.status, "completed");

    for (const rel of [ANS_REL, GOV_REL, MANIFEST_REL]) {
      assert.ok(existsSync(join(target, rel)), `${rel} 应落盘`);
    }
    const ans = JSON.parse(readFileSync(join(target, ANS_REL), "utf8")) as {
      governanceBoundary: { path: string; acceptance: { accepted: boolean; pin: { path: string; sha256: string }[] } };
    };
    assert.equal(ans.governanceBoundary.path, GOV_REL);
    assert.equal(ans.governanceBoundary.acceptance.accepted, true);
    assert.deepEqual(
      ans.governanceBoundary.acceptance.pin.map((p) => p.path).sort(),
      [GOV_REL, "角色卡/X/boundary.yaml"].sort(),
    );
    for (const p of ans.governanceBoundary.acceptance.pin) {
      assert.equal(sha256Of(join(target, p.path)), p.sha256, `pin 与实际 SHA-256 一致：${p.path}`);
    }

    const loaded = await loadEffectiveConfig({ projectRoot: target, skillRoot: target, fallback: genesisProject(target) });
    assert.equal(loaded.source.kind, "ans");
    assert.equal(loaded.source.acceptance.accepted, true, "pin-backed acceptance 应 accepted");
    await handle.dispose();
  });
});

// ————————— ② 守卫：未 settle / 非创世态 —————————

test("守卫：openRoleSession 句柄尚未 settle → finalize 拒绝且零副作用", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const handle = await openRoleSession(
      { roleId: "su", project: genesisProject(target), genesisFinalize: true, operatorChannel: channelAllow },
      { createAdapter: settledStubAdapter },
    );
    assert.equal(handle.settled, false);
    const res = await handle.finalize!();
    assert.equal(res.ok, false);
    assert.equal(res.status, "blocked");
    assert.match(res.message ?? "", /settle|半成品/);
    assert.equal(existsSync(join(target, ".ans")), false, "守卫拒绝不得写盘");
    await handle.dispose();
  });
});

test("守卫：非创世态（.ans 已存在）→ finalize 拒绝（status=not-genesis），不覆盖", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(join(target, ".ans"), { recursive: true });
    writeFileSync(join(target, ANS_REL), JSON.stringify({ marker: "已存在" }));
    const handle = await openRoleSession(
      { roleId: "su", project: genesisProject(target), genesisFinalize: true, operatorChannel: channelAllow },
      { createAdapter: settledStubAdapter },
    );
    await handle.send("hi");
    await driveToSettled(handle);
    const res = await handle.finalize!();
    assert.equal(res.ok, false);
    assert.equal(res.status, "not-genesis");
    assert.match(readFileSync(join(target, ANS_REL), "utf8"), /已存在/);
    await handle.dispose();
  });
});

// ————————— ③ fail-closed：未注入确认通道 → 不完成 —————————

test("fail-closed：未注入确认通道 → finalize 不完成（status=unavailable）且零副作用", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(join(target, "角色卡", "X"), { recursive: true });
    writeFileSync(join(target, "角色卡", "X", "role-card.md"), "# X\n");
    writeFileSync(join(target, "角色卡", "X", "boundary.yaml"), ROLE_X_BOUNDARY);
    const handle = await openRoleSession(
      { roleId: "su", project: genesisProject(target), genesisFinalize: true },
      { createAdapter: settledStubAdapter },
    );
    await handle.send("hi");
    await driveToSettled(handle);
    const res = await handle.finalize!();
    assert.equal(res.ok, false);
    assert.equal(res.status, "unavailable");
    assert.equal(existsSync(join(target, ANS_REL)), false, "无确认通道 → 零副作用（fail-closed）");
    await handle.dispose();
  });
});

// ————————— ④ 向后兼容：不开启 → 句柄无 finalize/settled —————————

test("向后兼容：不开启 genesisFinalize → 句柄无 settled/finalize（冻结契约形状不变）", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(join(target, "角色卡", "X"), { recursive: true });
    writeFileSync(join(target, "角色卡", "X", "role-card.md"), "# X\n");
    writeFileSync(join(target, "角色卡", "X", "boundary.yaml"), ROLE_X_BOUNDARY);
    const project: ProjectConfig = {
      projectRoot: target,
      skillRoot: target,
      roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    };
    const handle = await openRoleSession({ roleId: "X", project }, { createAdapter: settledStubAdapter });
    assert.equal(handle.finalize, undefined, "未开启 → 无 finalize");
    assert.equal(handle.settled, undefined, "未开启 → 无 settled");
    assert.equal(typeof handle.send, "function");
    assert.equal(typeof handle.events, "function");
    assert.equal(typeof handle.dispose, "function");
    await handle.dispose();
  });
});

// ————————— ⑤ 自动重 pin（桌面本条路径）：加角色后 pin 自动纳入 —————————

test("自动重 pin（桌面路径）：确认后加角色 → 下一轮 settle 后 pin 自动纳入", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const handle = await openRoleSession(
      { roleId: "su", project: genesisProject(target), genesisFinalize: true, autoRepin: true, operatorChannel: channelAllow },
      { createAdapter: settledStubAdapter },
    );
    mkdirSync(join(target, "角色卡", "A"), { recursive: true });
    writeFileSync(join(target, "角色卡", "A", "role-card.md"), "# A\n");
    writeFileSync(join(target, "角色卡", "A", "boundary.yaml"), "role: A\nentries: []\n");
    await handle.send("建角色 A");
    await driveToSettled(handle);
    assert.equal(existsSync(join(target, ANS_REL)), false, "创世态：settle 不自动 pin");

    const res = await handle.finalize!();
    assert.equal(res.ok, true, res.message ?? "");

    mkdirSync(join(target, "角色卡", "B"), { recursive: true });
    writeFileSync(join(target, "角色卡", "B", "role-card.md"), "# B\n");
    writeFileSync(join(target, "角色卡", "B", "boundary.yaml"), "role: B\nentries: []\n");
    await handle.send("再建角色 B");
    await driveToSettled(handle);

    const ans = JSON.parse(readFileSync(join(target, ANS_REL), "utf8")) as {
      governanceBoundary: { acceptance: { pin: { path: string; sha256: string }[] } };
    };
    assert.deepEqual(
      ans.governanceBoundary.acceptance.pin.map((p) => p.path).sort(),
      [GOV_REL, "角色卡/A/boundary.yaml", "角色卡/B/boundary.yaml"].sort(),
      "自动重 pin 应纳入新角色 B",
    );
    for (const p of ans.governanceBoundary.acceptance.pin) {
      assert.equal(sha256Of(join(target, p.path)), p.sha256, `应与磁盘一致：${p.path}`);
    }
    await handle.dispose();
  });
});
