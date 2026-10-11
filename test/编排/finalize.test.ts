// test/编排/finalize.test.ts
// 编排角色自测：**收口（finalize）T37 改造**（设计 §13）——su 主动提议 → 客户确认 → 才完成；
// pin 首次在确认时写、其后每轮 su settle 自动重 pin。
//
// 覆盖（对应 §13.5 的可自动验收项）：
//   ① **提议挂起**：调用后**不立即完成**（未确认前零副作用），等确认；确认通过 → 完成。
//   ② **确认通过 → 完成**：写出 `角色卡/governance-boundary.yaml`（三普通目录）+ `.ans`（pin+acceptance）
//      + `docs/bootstrap-manifest.md`；pin 与文件实际 SHA-256 一致（本测试独立重算比对）。
//   ③ **拒绝 / 超时 / 通道不可用 → 不完成**（fail-closed），且**零副作用**。
//   ④ **非创世态调用 → 拒绝**（不是静默）。
//   ⑤ **确认前的每一笔写都过 `resolveWrite`**（负例：拿掉授权 → 被拒且零副作用、不打扰客户）。
//   ⑥ **自动重 pin**：确认后再跑一轮、加一个角色 → settle 后 pin 自动纳入新角色（与磁盘重新一致）。
//
// 全部用系统临时目录，用后清理——不在仓库留文件。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openGovernanceSession, runGovernSession } from "../../src/pipeline/orchestration/govern-session.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { finalizeBootstrap, isGenesisState } from "../../src/common/编排/finalize.ts";
import { loadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import { resolveRole } from "../../src/service/role/resolve-role.ts";
import { resolveBoundary } from "../../src/service/boundary/resolve-boundary.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { EXIT_OK, EXIT_FAILURE } from "../../src/common/编排/exit-codes.ts";
import type { OperatorChannelFn, OperatorPrompt, OperatorOutcome, WriteGate } from "../../src/provider/pi/session.ts";
import type { BoundaryEntry, BoundarySection1 } from "../../src/model/boundary.ts";
import type { WriteDecision } from "../../src/model/decision.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent, ToolCall } from "../../src/provider/pi/session.ts";

const GOV_REL = "角色卡/governance-boundary.yaml";
const ANS_REL = ".ans/project.json";
const MANIFEST_REL = "docs/bootstrap-manifest.md";
const ROLE_X_BOUNDARY = "role: X\nentries:\n  - kind: file\n    path: src/x.ts\n    purpose: 测试角色条目\n";

/** 新建临时根，用后清理。 */
async function withRoot<T>(fn: (ctx: { root: string; target: string }) => Promise<T>): Promise<T> {
  const root = mkdtempSync(join(tmpdir(), "ans-finalize-"));
  try {
    return await fn({ root, target: join(root, "proj") });
  } finally {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* 忽略清理失败 */
    }
  }
}

const tick = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 全放行 gate（仅用于测试桩适配器——不检验边界；真判定的用例见负例）。 */
const allowGate = (() => ({ allowed: true }) as unknown as WriteDecision) as WriteGate;

/** su 在创世会话里写出的东西：角色 X 的三件套（**治理边界文档由 finalize 写出**，不由 su 写）。 */
const GENESIS_SCRIPT: ToolCall[] = [
  { name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# 角色：X\n\n由 su 创世会话创建。\n" } },
  { name: "write_file", args: { path: "角色卡/X/boundary.yaml", content: ROLE_X_BOUNDARY } },
  { name: "write_file", args: { path: "角色卡/X/memo.md", content: "# X 备忘录\n" } },
];

/** 创世项目（空文件夹 + 操作者发起的 bootstrap）。 */
function genesisProject(target: string): ProjectConfig {
  return {
    projectRoot: target,
    skillRoot: target,
    roles: {},
    builtInRoles: ["su"],
    genesisBootstrap: { source: "test:desktop 导入空项目=发起 bootstrap（操作者指令）" },
  };
}

/** 桩适配器：每轮 prompt 后、每次消费事件流即产出一个 `settled`（不写盘；用于钉「时机」语义）。 */
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

/** 恒定「放行」通道（客户确认通过）。 */
const channelAllow: OperatorChannelFn = () => ({ outcome: "allow", operatorId: "test-客户" });
/** 恒定「拒绝」通道。 */
const channelDeny: OperatorChannelFn = () => ({ outcome: "deny", operatorId: "test-客户", reason: "再等等" });
/** 恒定「不可用」通道（无人值守）。 */
const channelUnavailable: OperatorChannelFn = () => ({ outcome: "unavailable", reason: "无人值守" });

/** 延迟通道：手动 resolve；用于证明「提议后挂起、未确认前不完成」。 */
function deferredChannel(): {
  fn: OperatorChannelFn;
  prompts: OperatorPrompt[];
  resolve: (o: OperatorOutcome) => void;
} {
  let resolveOut: (o: OperatorOutcome) => void = () => {};
  const p = new Promise<OperatorOutcome>((res) => {
    resolveOut = res;
  });
  const prompts: OperatorPrompt[] = [];
  const fn: OperatorChannelFn = (prompt) => {
    prompts.push(prompt);
    return p;
  };
  return { fn, prompts, resolve: resolveOut };
}

/** 独立重算某文件 SHA-256（与 finalize/门禁引擎同一算法：原始字节 + node:crypto）。 */
function sha256Of(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function readAns(target: string): {
  roles: Record<string, { card: string; boundary: string }>;
  governanceBoundary: { path: string; acceptance: { accepted: boolean; source: string; pin: { path: string; sha256: string }[] } };
} {
  return JSON.parse(readFileSync(join(target, ANS_REL), "utf8"));
}

/** 驱动句柄事件流到 settled 收口（每个 settled 触发一句自动重 pin 后本条才 break）。 */
async function driveToSettled(handle: { events(): AsyncIterable<{ kind: string }> }): Promise<void> {
  for await (const ev of handle.events()) {
    if (ev.kind === "settled") break;
  }
}

/** 建一个创世 su 治理会话句柄（有 finalize 能力）。 */
async function openGenesisGovern(
  target: string,
  ch: OperatorChannelFn | undefined,
  adapter: () => RuntimeAdapter = settledStubAdapter,
) {
  return openGovernanceSession(
    { taskId: "T37", project: genesisProject(target), operatorChannel: ch },
    { createAdapter: adapter },
  );
}

// ——————————————— ① 提议挂起：未确认前不完成 ———————————————

test("提议挂起：finalize 提议后挂起等确认；未确认前**零副作用**、不完成；确认通过才写出", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const ch = deferredChannel();
    const handle = await openGenesisGovern(target, ch.fn);
    await handle.send("（桩会话）");
    await driveToSettled(handle);
    // 先在盘上摆一个角色边界（模拟 su 已写出角色）——但**尚未**确认，故不应有任何 finalize 产物。
    mkdirSync(join(target, "角色卡", "X"), { recursive: true });
    writeFileSync(join(target, "角色卡", "X", "role-card.md"), "# X\n");
    writeFileSync(join(target, "角色卡", "X", "boundary.yaml"), ROLE_X_BOUNDARY);

    const pending = handle.finalize();
    await tick();
    assert.equal(ch.prompts.length, 1, "应已提出「su 提议收口」（走确认通道）");
    assert.equal(existsSync(join(target, ANS_REL)), false, "未确认前**不得**写 .ans");
    assert.equal(existsSync(join(target, GOV_REL)), false, "未确认前**不得**写治理边界文档");
    assert.equal(existsSync(join(target, MANIFEST_REL)), false, "未确认前**不得**写 manifest");

    ch.resolve({ outcome: "allow", operatorId: "客户" });
    const res = await pending;
    assert.equal(res.ok, true, `确认通过后应完成：${res.message ?? ""}`);
    assert.equal(res.status, "completed");
    assert.ok(existsSync(join(target, ANS_REL)), "确认通过后应写出 .ans");
    await handle.dispose();
  });
});

// ——————————————— ② 确认通过 → 完成（写出三份产物，pin 一致） ———————————————

test("确认通过 → 完成：写出治理边界文档（三普通目录）+ .ans(pin) + manifest；pin 与实算一致", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const handle = await openGenesisGovern(target, channelAllow, () =>
      createFakeRuntimeAdapter({ gate: allowGate, script: GENESIS_SCRIPT, writeRoot: target }),
    );
    await handle.send("请据对话创建角色 X");
    await driveToSettled(handle);
    assert.equal(handle.settled, true);

    const res = await handle.finalize();
    assert.equal(res.ok, true, `finalize 应完成：${res.message ?? ""}`);
    assert.equal(res.status, "completed");
    assert.deepEqual(
      [...res.wrote].sort(),
      [ANS_REL, GOV_REL, MANIFEST_REL].sort(),
      "应写出治理边界文档 + .ans + manifest",
    );

    for (const rel of [ANS_REL, GOV_REL, MANIFEST_REL]) {
      assert.ok(existsSync(join(target, rel)), `${rel} 应落盘`);
    }

    // 治理边界文档：三个**普通目录**（无 slug）。
    const govDoc = readFileSync(join(target, GOV_REL), "utf8");
    for (const p of ["角色卡/", "docs/", ".ans/"]) {
      assert.ok(govDoc.includes(p), `治理边界文档应含目录条目 ${p}`);
    }
    assert.ok(!govDoc.includes("conditional-directory"), "治理边界文档应为普通目录（无 slug）");

    // .ans：acceptance pin-backed；来源如实记录「客户确认」；path 指向治理边界文档。
    const ans = readAns(target);
    assert.equal(ans.governanceBoundary.path, GOV_REL, "governanceBoundary.path 应指向治理边界文档");
    assert.equal(ans.governanceBoundary.acceptance.accepted, true);
    assert.match(ans.governanceBoundary.acceptance.source, /客户确认/, "来源应如实记录客户确认");
    const pinPaths = ans.governanceBoundary.acceptance.pin.map((p) => p.path).sort();
    assert.deepEqual(pinPaths, [GOV_REL, "角色卡/X/boundary.yaml"].sort(), "pin 应覆盖治理边界 + 角色边界");
    for (const p of ans.governanceBoundary.acceptance.pin) {
      assert.equal(sha256Of(join(target, p.path)), p.sha256, `pin 与实际 SHA-256 一致：${p.path}`);
    }
    assert.deepEqual(ans.roles, { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } });

    // 载入器认它为 pin-backed accepted；角色边界可解析（无 parseError）。
    const loaded = await loadEffectiveConfig({ projectRoot: target, skillRoot: target, fallback: genesisProject(target) });
    assert.equal(loaded.source.kind, "ans");
    assert.equal(loaded.source.acceptance.accepted, true, "应 pin-backed accepted");
    const role = await resolveRole("X", loaded.project);
    assert.equal(role.boundary.acceptance.accepted, true);
    assert.equal(role.boundary.parseError, undefined);

    await handle.dispose();
  });
});

// ——————————————— ③ 拒绝 / 超时 / 通道不可用 → 不完成（fail-closed，零副作用） ———————————————

test("确认拒绝 → 不完成（status=declined）且零副作用", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(join(target, "角色卡", "X"), { recursive: true });
    writeFileSync(join(target, "角色卡", "X", "role-card.md"), "# X\n");
    writeFileSync(join(target, "角色卡", "X", "boundary.yaml"), ROLE_X_BOUNDARY);
    const handle = await openGenesisGovern(target, channelDeny);
    await handle.send("（桩会话）");
    await driveToSettled(handle);

    const res = await handle.finalize();
    assert.equal(res.ok, false);
    assert.equal(res.status, "declined");
    assert.match(res.message ?? "", /未获客户确认|拒绝/);
    assert.equal(existsSync(join(target, ANS_REL)), false, "拒绝 → 零副作用（不写 .ans）");
    assert.equal(existsSync(join(target, GOV_REL)), false, "拒绝 → 不写治理边界文档");
    await handle.dispose();
  });
});

test("确认超时 → 不完成（status=unavailable）且零副作用", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(join(target, "角色卡", "X"), { recursive: true });
    writeFileSync(join(target, "角色卡", "X", "role-card.md"), "# X\n");
    writeFileSync(join(target, "角色卡", "X", "boundary.yaml"), ROLE_X_BOUNDARY);
    const never: OperatorChannelFn = () => new Promise<OperatorOutcome>(() => {});
    const handle = await openGovernanceSession(
      { taskId: "T37", project: genesisProject(target), operatorChannel: never, confirmTimeoutMs: 30 },
      { createAdapter: settledStubAdapter },
    );
    await handle.send("（桩会话）");
    await driveToSettled(handle);

    const res = await handle.finalize();
    assert.equal(res.ok, false);
    assert.equal(res.status, "unavailable");
    assert.match(res.message ?? "", /超时/);
    assert.equal(existsSync(join(target, ANS_REL)), false, "超时 → 零副作用");
    await handle.dispose();
  });
});

test("确认通道不可用 → 不完成（status=unavailable）且零副作用", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(join(target, "角色卡", "X"), { recursive: true });
    writeFileSync(join(target, "角色卡", "X", "role-card.md"), "# X\n");
    writeFileSync(join(target, "角色卡", "X", "boundary.yaml"), ROLE_X_BOUNDARY);
    const handle = await openGenesisGovern(target, channelUnavailable);
    await handle.send("（桩会话）");
    await driveToSettled(handle);
    const res = await handle.finalize();
    assert.equal(res.ok, false);
    assert.equal(res.status, "unavailable");
    assert.equal(existsSync(join(target, ANS_REL)), false, "通道不可用 → 零副作用");
    await handle.dispose();
  });
});

// ——————————————— ④ 非创世态调用 → 拒绝 ———————————————

test("非创世态调用 → 拒绝（status=not-genesis），且不覆盖既有 .ans", async () => {
  await withRoot(async ({ target }) => {
    // 先摆出「已完成 bootstrap」的盘面：.ans 已存在。
    mkdirSync(join(target, ".ans"), { recursive: true });
    writeFileSync(join(target, ANS_REL), JSON.stringify({ marker: "已存在" }, null, 2));
    const handle = await openGenesisGovern(target, channelAllow);
    await handle.send("（桩会话）");
    await driveToSettled(handle);

    const res = await handle.finalize();
    assert.equal(res.ok, false);
    assert.equal(res.status, "not-genesis");
    assert.match(res.message ?? "", /非创世态/);
    assert.match(readFileSync(join(target, ANS_REL), "utf8"), /已存在/, "既有 .ans 不得被覆盖");
    await handle.dispose();
  });
});

// ——————————————— ⑤ 确认前每一笔写都过 resolveWrite（负例：拿掉授权 → 被拒且零副作用） ———————————————

test("负例（不绕门）：条件目录边界无相应条件 → 门禁拒（确认前即拒，不打扰客户）且零副作用", async () => {
  await withRoot(async ({ target }) => {
    // 治理边界 = **条件目录**（须 scope 声明条件才激活）。su 会话在此边界下结束，但 finalize 的 scope
    // 是 undefined ⇒ 条件目录不激活 ⇒ `.ans/`、`docs/` 三笔写均被拒 → 前置预检即拒、不发提议。
    mkdirSync(join(target, "角色卡"), { recursive: true });
    writeFileSync(
      join(target, GOV_REL),
      [
        "role: 治理边界",
        "entries:",
        "  - kind: conditional-directory",
        "    path: 角色卡/",
        "    condition: role-restructuring",
        "    root: project",
        "    purpose: x",
        "  - kind: conditional-directory",
        "    path: .ans/",
        "    condition: project-init",
        "    root: project",
        "    purpose: x",
        "",
      ].join("\n"),
    );
    const project: ProjectConfig = {
      projectRoot: target,
      skillRoot: target,
      roles: {},
      builtInRoles: ["su"],
      governanceBoundary: { path: GOV_REL, acceptance: { accepted: true, source: "test:fixture" } },
    };
    let channelCalls = 0;
    const ch: OperatorChannelFn = () => {
      channelCalls++;
      return { outcome: "allow" };
    };
    const handle = await openGovernanceSession(
      { taskId: "T37-deny", project, operatorChannel: ch },
      { createAdapter: settledStubAdapter },
    );
    await handle.send("（桩会话）");
    await driveToSettled(handle);

    const res = await handle.finalize();
    assert.equal(res.ok, false);
    assert.equal(res.status, "blocked");
    assert.match(res.message ?? "", /门禁拒绝|条件|未匹配|未被接受/, "拒绝原因应说明门禁判定");
    assert.equal(channelCalls, 0, "门禁前置预检就拒 → **不打扰客户**（未发确认请求）");
    assert.equal(existsSync(join(target, ANS_REL)), false, "被拒不得创建 .ans");
    assert.equal(existsSync(join(target, ".ans")), false, "被拒不得创建 .ans/");
    await handle.dispose();
  });
});

test("负例（单元）：边界不接受 → finalizeBootstrap 拒绝且零副作用", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(join(target, "角色卡", "X"), { recursive: true });
    writeFileSync(join(target, "角色卡", "X", "role-card.md"), "# X\n");
    writeFileSync(join(target, "角色卡", "X", "boundary.yaml"), ROLE_X_BOUNDARY);
    const unaccepted: BoundarySection1 = { entries: [], boundarySource: "x", acceptance: { accepted: false, source: "" } };
    const res = await finalizeBootstrap({ projectRoot: target, skillRoot: target, boundary: unaccepted });
    assert.equal(res.ok, false);
    assert.equal(res.status, "blocked");
    assert.equal(existsSync(join(target, ".ans")), false, "未接受边界 → 拒且零副作用");
    assert.equal(existsSync(join(target, GOV_REL)), false, "未接受边界 → 不写治理边界文档");
  });
});

// ——————————————— 单元：finalizeBootstrap 直调 + 无可 pin 之物 ———————————————

/** 普通目录（创世种子形状）边界：scope:undefined 下命中即放行。 */
function seedLikeBoundary(): BoundarySection1 {
  const dir = (p: string): BoundaryEntry => ({ root: "project", path: p, kind: "directory", purpose: "test" });
  return {
    entries: [dir("角色卡/"), dir("docs/"), dir(".ans/")],
    boundarySource: GOV_REL,
    acceptance: { accepted: true, source: "test:operator bootstrap" },
  };
}

test("finalizeBootstrap（单元）：写出治理边界文档 + .ans；pin 覆盖两者；无可 pin 之物 → 拒绝", async () => {
  await withRoot(async ({ target }) => {
    // 空目录、无角色、无治理边界 → 无可 pin 之物 → 拒。
    mkdirSync(target, { recursive: true });
    const none = await finalizeBootstrap({ projectRoot: target, skillRoot: target, boundary: seedLikeBoundary() });
    assert.equal(none.ok, false);
    assert.equal(none.status, "nothing-to-pin");
    assert.match(none.message ?? "", /无可 pin|fail-closed/);
    assert.equal(existsSync(join(target, ".ans")), false);

    // 有角色边界 → 成功；pin 覆盖 治理边界文档 + 角色边界，且与实算一致。
    mkdirSync(join(target, "角色卡", "X"), { recursive: true });
    writeFileSync(join(target, "角色卡", "X", "role-card.md"), "# X\n");
    writeFileSync(join(target, "角色卡", "X", "boundary.yaml"), ROLE_X_BOUNDARY);
    const res = await finalizeBootstrap({ projectRoot: target, skillRoot: target, boundary: seedLikeBoundary() });
    assert.equal(res.ok, true, res.message ?? "");
    assert.deepEqual(res.roles, ["X"]);
    assert.ok(existsSync(join(target, GOV_REL)), "应写出治理边界文档");
    assert.deepEqual(res.pins.map((p) => p.path).sort(), [GOV_REL, "角色卡/X/boundary.yaml"].sort());
    for (const p of res.pins) assert.equal(p.sha256, sha256Of(join(target, p.path)), `pin 实算一致：${p.path}`);
  });
});

test("isGenesisState：无 .ans 为创世态；有 .ans 为非创世态", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    assert.equal(await isGenesisState(target), true, "无 .ans → 创世态");
    mkdirSync(join(target, ".ans"), { recursive: true });
    writeFileSync(join(target, ANS_REL), "{}");
    assert.equal(await isGenesisState(target), false, "有 .ans → 非创世态");
  });
});

// ——————————————— ⑥ 自动重 pin：加角色后 pin 自动纳入 ———————————————

test("自动重 pin：确认后加一个角色 → 下一轮 su settle 后 pin 自动纳入新角色（与磁盘重新一致）", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const handle = await openRoleSession(
      { roleId: "su", project: genesisProject(target), genesisFinalize: true, autoRepin: true, operatorChannel: channelAllow },
      { createAdapter: settledStubAdapter },
    );

    // 第 1 轮：su 写出角色 A（此处直接落盘代表 su 的写）→ settle。创世态 → 自动重 pin 为 no-op。
    mkdirSync(join(target, "角色卡", "A"), { recursive: true });
    writeFileSync(join(target, "角色卡", "A", "role-card.md"), "# A\n");
    writeFileSync(join(target, "角色卡", "A", "boundary.yaml"), "role: A\nentries: []\n");
    await handle.send("建角色 A");
    await driveToSettled(handle);
    assert.equal(existsSync(join(target, ANS_REL)), false, "创世态：settle 后**不自动** pin（首次经客户确认才写）");

    // 客户确认 → 收口（写 .ans，pin = 治理边界 + 角色 A）。
    const res = await handle.finalize!();
    assert.equal(res.ok, true, res.message ?? "");
    assert.deepEqual(readAns(target).governanceBoundary.acceptance.pin.map((p) => p.path).sort(), [GOV_REL, "角色卡/A/boundary.yaml"].sort());

    // 第 2 轮：su 再写角色 B → settle → **自动重 pin**（非创世态）→ pin 纳入 B。
    mkdirSync(join(target, "角色卡", "B"), { recursive: true });
    writeFileSync(join(target, "角色卡", "B", "role-card.md"), "# B\n");
    writeFileSync(join(target, "角色卡", "B", "boundary.yaml"), "role: B\nentries: []\n");
    await handle.send("再建角色 B");
    await driveToSettled(handle);

    const ans = readAns(target);
    assert.deepEqual(
      ans.governanceBoundary.acceptance.pin.map((p) => p.path).sort(),
      [GOV_REL, "角色卡/A/boundary.yaml", "角色卡/B/boundary.yaml"].sort(),
      "自动重 pin 应把新角色 B 的边界纳入 pin",
    );
    assert.deepEqual(Object.keys(ans.roles).sort(), ["A", "B"], "roles 应含 A、B");
    // pin 与磁盘重新一致。
    for (const p of ans.governanceBoundary.acceptance.pin) {
      assert.equal(sha256Of(join(target, p.path)), p.sha256, `重 pin 后应与磁盘一致：${p.path}`);
    }
    await handle.dispose();
  });
});

// ——————————————— ⑦ 自终止松绑：收口后 su 仍能写角色卡（治理边界文档三目录） ———————————————

test("自终止松绑：收口后 su 的边界 = 项目治理边界文档 → 仍可写 `角色卡/` 新角色（不越界仍拒）", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const handle = await openGenesisGovern(target, channelAllow, () =>
      createFakeRuntimeAdapter({ gate: allowGate, script: GENESIS_SCRIPT, writeRoot: target }),
    );
    await handle.send("创世");
    await driveToSettled(handle);
    const res = await handle.finalize();
    assert.equal(res.ok, true, res.message ?? "");
    await handle.dispose();

    // 新会话（非创世态）：su 的边界 = 项目治理边界文档（三普通目录）。
    const loaded = await loadEffectiveConfig({ projectRoot: target, skillRoot: target, fallback: genesisProject(target) });
    assert.equal(loaded.project.governanceBoundary?.path, GOV_REL);
    const reopened: ProjectConfig = { ...loaded.project, builtInRoles: ["su"] }; // 不带 genesisBootstrap
    const suBoundary = await resolveBoundary("su", reopened);
    const canWriteNewRole = resolveWrite("角色卡/NewRole/role-card.md", suBoundary, undefined, {
      skillRoot: target,
      projectRoot: target,
    });
    assert.equal(canWriteNewRole.allowed, true, "收口后 su 仍可写新角色（客户：后面可动态增改）");
    const cannotWriteSrc = resolveWrite("src/evil.ts", suBoundary, undefined, { skillRoot: target, projectRoot: target });
    assert.equal(cannotWriteSrc.allowed, false, "越界（src/）仍拒——写集有界，非 blanket");
  });
});

// ——————————————— ⑧ CLI 一次性前端：注入确认通道 → 完成 ———————————————

test("runGovernSession：显式 finalizeBootstrap + 注入放行通道 → 单轮 settle 后写出", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const result = await runGovernSession(
      { taskId: "T37-cli", project: genesisProject(target), finalizeBootstrap: true, operatorChannel: channelAllow },
      { createAdapter: () => createFakeRuntimeAdapter({ gate: allowGate, script: GENESIS_SCRIPT, writeRoot: target }) },
    );
    assert.equal(result.code, EXIT_OK);
    assert.ok(result.finalize, "应带回收口结果");
    assert.equal(result.finalize!.ok, true, result.finalize!.message ?? "");
    assert.ok(existsSync(join(target, ANS_REL)));
    assert.ok(existsSync(join(target, GOV_REL)));
    assert.ok(existsSync(join(target, MANIFEST_REL)));
  });
});

test("runGovernSession：finalizeBootstrap + 注入拒绝通道 → 不完成（非 0 收口）", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const result = await runGovernSession(
      { taskId: "T37-cli-deny", project: genesisProject(target), finalizeBootstrap: true, operatorChannel: channelDeny },
      { createAdapter: () => createFakeRuntimeAdapter({ gate: allowGate, script: GENESIS_SCRIPT, writeRoot: target }) },
    );
    assert.equal(result.code, EXIT_FAILURE);
    assert.equal(result.finalize!.status, "declined");
    assert.equal(existsSync(join(target, ANS_REL)), false, "拒绝 → 不写");
  });
});
