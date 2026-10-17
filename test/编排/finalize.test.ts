// test/编排/finalize.test.ts
// 编排角色自测：**创世自动收尾**（A-4，2026-10-12 设计 A 组）——「提议 + 确认」已删；每轮 su settle 后
// 由代码**自动**写出 `.ans`(pin) + `角色卡/governance-boundary.yaml` + `docs/bootstrap-manifest.md`。
// 「同意才落盘」不在本文件——客户确认由 A-1 交互工具 + F4 发行承担（见 confirmation-gated.test.ts）。
//
// 覆盖：
//   ① **自动收尾（创世态首个「有物可 pin」的 settle）**：三产物落盘；pin 与实算一致（本测试独立重算
//      比对）；`.ans` 可被载入器认作 pin-backed accepted；
//   ② **无可 pin 之物 → 零副作用**（settle 不会凭空把项目转正）；
//   ③ **自动重 pin（非创世态）**：加角色后下一轮 settle → pin 自动纳入新角色（与磁盘重新一致）；
//   ④ `finalizeBootstrap` 单元：未接受边界 → 拒且零副作用；pin 覆盖治理边界文档 + 角色边界；
//   ⑤ `isGenesisState`。
//
// 全部用系统临时目录，用后清理——不在仓库留文件。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { finalizeBootstrap, isGenesisState, repinIfBootstrapped } from "../../src/common/编排/finalize.ts";
import { loadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import { resolveRole } from "../../src/service/role/resolve-role.ts";
import type { BoundaryEntry, BoundarySection1 } from "../../src/model/boundary.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent } from "../../src/provider/pi/session.ts";

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

/** 桩适配器：每次消费事件流即产出一个 `settled`（不写盘；角色盘面由测试预置，隔离「收尾」语义）。 */
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

/** 独立重算某文件 SHA-256（与 finalize/门禁引擎同一算法：原始字节 + node:crypto）。 */
function sha256Of(absPath: string): string {
  return createHash("sha256").update(readFileSync(absPath)).digest("hex");
}

function readAns(target: string): {
  roles: Record<string, { card: string; boundary: string }>;
  governanceModel?: string;
  governanceBoundary: {
    path: string;
    acceptance: { accepted: boolean; source: string; pin: { path: string; sha256: string }[] };
  };
} {
  return JSON.parse(readFileSync(join(target, ANS_REL), "utf8"));
}

/** 驱动句柄事件流到 settled 收口（settle 触发的自动收尾在该事件产出前完成）。 */
async function driveToSettled(handle: { events(): AsyncIterable<{ kind: string }> }): Promise<void> {
  for await (const ev of handle.events()) {
    if (ev.kind === "settled") break;
  }
}

/** 预置一个角色盘面（模拟 su 已写出的角色三件套）。 */
function placeRole(target: string, id: string): void {
  mkdirSync(join(target, "角色卡", id), { recursive: true });
  writeFileSync(join(target, "角色卡", id, "role-card.md"), `# 角色：${id}\n`);
  writeFileSync(join(target, "角色卡", id, "boundary.yaml"), id === "X" ? ROLE_X_BOUNDARY : `role: ${id}\nentries: []\n`);
  writeFileSync(join(target, "角色卡", id, "memo.md"), `# ${id} 备忘录\n`);
}

// ——————————————— ① 自动收尾（创世态首个有物可 pin 的 settle） ———————————————

test("自动收尾：创世 su 会话 settle 后**自动**写出治理边界文档 + .ans(pin) + manifest；pin 与实算一致", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    placeRole(target, "X"); // su 已写出角色（此处预置代表其写入）

    const handle = await openRoleSession(
      { roleId: "su", project: genesisProject(target) },
      { createAdapter: settledStubAdapter },
    );
    await handle.send("（桩会话）");
    await driveToSettled(handle);
    await handle.dispose();

    for (const rel of [ANS_REL, GOV_REL, MANIFEST_REL]) {
      assert.ok(existsSync(join(target, rel)), `${rel} 应由自动收尾落盘`);
    }

    // 治理边界文档：三个**普通目录**（无 slug）。
    const govDoc = readFileSync(join(target, GOV_REL), "utf8");
    for (const p of ["角色卡/", "docs/", ".ans/"]) {
      assert.ok(govDoc.includes(p), `治理边界文档应含目录条目 ${p}`);
    }
    assert.ok(!govDoc.includes("conditional-directory"), "治理边界文档应为普通目录（无 slug）");

    // .ans：pin-backed；来源 = 创世授权来源（A-4 起没有「客户确认完成」这一步）；path 指向治理边界文档。
    const ans = readAns(target);
    assert.equal(ans.governanceBoundary.path, GOV_REL, "governanceBoundary.path 应指向治理边界文档");
    assert.equal(ans.governanceBoundary.acceptance.accepted, true);
    assert.match(ans.governanceBoundary.acceptance.source, /发起 bootstrap/, "来源应如实记录创世授权来源");
    const pinPaths = ans.governanceBoundary.acceptance.pin.map((p) => p.path).sort();
    assert.deepEqual(pinPaths, [GOV_REL, "角色卡/X/boundary.yaml"].sort(), "pin 应覆盖治理边界 + 角色边界");
    for (const p of ans.governanceBoundary.acceptance.pin) {
      assert.equal(sha256Of(join(target, p.path)), p.sha256, `pin 与实际 SHA-256 一致：${p.path}`);
    }
    assert.deepEqual(ans.roles, { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } });
    // V1b：single 旧项目首次收尾**不写** governanceModel，`.ans` 顶层形状逐字不变。
    assert.equal(
      Object.prototype.hasOwnProperty.call(ans, "governanceModel"),
      false,
      "single 旧项目不得新增 governanceModel 字段",
    );
    assert.deepEqual(
      Object.keys(ans).sort(),
      ["governanceBoundary", "projectRoot", "roles", "skillRoot"],
      "single 旧项目 `.ans` 顶层形状必须逐字不变",
    );

    // 载入器认它为 pin-backed accepted；角色边界可解析（无 parseError）。
    const loaded = await loadEffectiveConfig({ projectRoot: target, skillRoot: target, fallback: genesisProject(target) });
    assert.equal(loaded.source.kind, "ans");
    assert.equal(loaded.source.acceptance.accepted, true, "应 pin-backed accepted");
    const role = await resolveRole("X", loaded.project);
    assert.equal(role.boundary.acceptance.accepted, true);
    assert.equal(role.boundary.parseError, undefined);
  });
});

// ——————————————— ①b trio 创世首次 settle 带模型 ———————————————

test("trio 创世首次 settle：自动收尾写 .ans 且含 governanceModel:'trio'（应用边界 + 调用方传模型）", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    placeRole(target, "X"); // 有物可 pin，收尾才会真正写 `.ans`

    const project: ProjectConfig = {
      projectRoot: target,
      skillRoot: target,
      roles: {},
      builtInRoles: ["rapporteur", "nominator", "convener"],
      governanceModel: "trio",
      genesisBootstrap: { source: "test:trio 创世（操作者指令）" },
    };
    const handle = await openRoleSession(
      { roleId: "rapporteur", project },
      { createAdapter: settledStubAdapter },
    );
    await handle.send("（桩会话）");
    await driveToSettled(handle);
    await handle.dispose();

    assert.ok(existsSync(join(target, ANS_REL)), "trio 创世首个有物可 pin 的 settle 应自动收尾");
    const ans = readAns(target);
    assert.equal(ans.governanceModel, "trio", "trio 创世收尾必须写出模型，否则下次加载回退 single");
    assert.equal(ans.governanceBoundary.acceptance.accepted, true);
    // 三人的 Section 1 不含 `.ans/**`；收尾能落盘证明 run-role 用了**应用专用边界**。
    assert.ok(existsSync(join(target, GOV_REL)), "应收尾写出治理边界文档");
    assert.ok(existsSync(join(target, MANIFEST_REL)), "应收尾写出 manifest");
  });
});

// ——————————————— ② 无可 pin 之物 → 零副作用 ———————————————

test("自动收尾守卫：settle 但无可 pin 之物（无角色、无既存治理边界文档）→ 零副作用，不凭空转正", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    const handle = await openRoleSession(
      { roleId: "su", project: genesisProject(target) },
      { createAdapter: settledStubAdapter },
    );
    await handle.send("（桩会话：什么也没写）");
    await driveToSettled(handle);
    await handle.dispose();

    assert.equal(existsSync(join(target, ".ans")), false, "无可 pin 之物 → 不得写 .ans（项目保持创世态）");
    assert.equal(existsSync(join(target, GOV_REL)), false, "无可 pin 之物 → 不得写治理边界文档");
    assert.equal(existsSync(join(target, MANIFEST_REL)), false, "无可 pin 之物 → 不得写 manifest");
  });
});

// ——————————————— ③ 自动重 pin（非创世态） ———————————————

test("自动重 pin：首次收尾后再建角色 B → 下一轮 settle 自动纳入 pin（与磁盘重新一致）", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    placeRole(target, "A");
    const handle = await openRoleSession(
      { roleId: "su", project: genesisProject(target) },
      { createAdapter: settledStubAdapter },
    );

    // 第 1 轮：首次收尾（创世态）。
    await handle.send("建角色 A");
    await driveToSettled(handle);
    assert.ok(existsSync(join(target, ANS_REL)), "首个有物可 pin 的 settle 应自动收尾（写 .ans）");
    assert.deepEqual(
      readAns(target).governanceBoundary.acceptance.pin.map((p) => p.path).sort(),
      [GOV_REL, "角色卡/A/boundary.yaml"].sort(),
    );

    // 第 2 轮：su 再写角色 B → settle → 自动重 pin（非创世态，不重写治理边界文档）。
    placeRole(target, "B");
    await handle.send("再建角色 B");
    await driveToSettled(handle);
    await handle.dispose();

    const ans = readAns(target);
    assert.deepEqual(
      ans.governanceBoundary.acceptance.pin.map((p) => p.path).sort(),
      [GOV_REL, "角色卡/A/boundary.yaml", "角色卡/B/boundary.yaml"].sort(),
      "自动重 pin 应把新角色 B 的边界纳入 pin",
    );
    assert.deepEqual(Object.keys(ans.roles).sort(), ["A", "B"], "roles 应含 A、B");
    for (const p of ans.governanceBoundary.acceptance.pin) {
      assert.equal(sha256Of(join(target, p.path)), p.sha256, `重 pin 后应与磁盘一致：${p.path}`);
    }
  });
});

// ——————————————— ④ finalizeBootstrap 单元 ———————————————

test("负例（单元）：边界不接受 → finalizeBootstrap 拒绝且零副作用", async () => {
  await withRoot(async ({ target }) => {
    placeRole(target, "X");
    const unaccepted: BoundarySection1 = { entries: [], boundarySource: "x", acceptance: { accepted: false, source: "" } };
    const res = await finalizeBootstrap({ projectRoot: target, skillRoot: target, boundary: unaccepted });
    assert.equal(res.ok, false);
    assert.equal(res.status, "blocked");
    assert.equal(existsSync(join(target, ".ans")), false, "未接受边界 → 拒且零副作用");
    assert.equal(existsSync(join(target, GOV_REL)), false, "未接受边界 → 不写治理边界文档");
  });
});

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
    placeRole(target, "X");
    const res = await finalizeBootstrap({ projectRoot: target, skillRoot: target, boundary: seedLikeBoundary() });
    assert.equal(res.ok, true, res.message ?? "");
    assert.deepEqual(res.roles, ["X"]);
    assert.ok(existsSync(join(target, GOV_REL)), "应写出治理边界文档");
    assert.deepEqual(res.pins.map((p) => p.path).sort(), [GOV_REL, "角色卡/X/boundary.yaml"].sort());
    for (const p of res.pins) assert.equal(p.sha256, sha256Of(join(target, p.path)), `pin 实算一致：${p.path}`);
  });
});

// ——————————————— ④b 治理模型字段（评审 §5.5） ———————————————

test("finalizeBootstrap：仅当给出 governanceModel 才写字段；trio 写出、不传保持旧 `.ans` 形状", async () => {
  await withRoot(async ({ target }) => {
    placeRole(target, "X");
    const boundary = seedLikeBoundary();

    // 不传模型（single/旧项目）：`.ans` 不得出现 governanceModel 字段。
    const single = await finalizeBootstrap({ projectRoot: target, skillRoot: target, boundary });
    assert.equal(single.ok, true, single.message ?? "");
    assert.equal(Object.prototype.hasOwnProperty.call(readAns(target), "governanceModel"), false);

    // 显式 trio：写出该字段。
    const trio = await finalizeBootstrap({ projectRoot: target, skillRoot: target, boundary, governanceModel: "trio" });
    assert.equal(trio.ok, true, trio.message ?? "");
    assert.equal(readAns(target).governanceModel, "trio");

    // 显式 single：如实写出（仅调用方明确要求时）。
    const explicitSingle = await finalizeBootstrap({
      projectRoot: target,
      skillRoot: target,
      boundary,
      governanceModel: "single",
    });
    assert.equal(explicitSingle.ok, true, explicitSingle.message ?? "");
    assert.equal(readAns(target).governanceModel, "single");
  });
});

test("repinIfBootstrapped：创世态由调用方传模型（trio 写出；不传旧形状）；非创世重 pin 保留既有 trio", async () => {
  await withRoot(async ({ target }) => {
    placeRole(target, "X");
    const boundary = seedLikeBoundary();

    // 创世态 + 不传模型 → 旧形状（无字段）。
    const single = await repinIfBootstrapped({ projectRoot: target, skillRoot: target, boundary });
    assert.equal(single?.ok, true, single?.message ?? "");
    assert.equal(Object.prototype.hasOwnProperty.call(readAns(target), "governanceModel"), false);

    // 非创世态重 pin：不传模型时必须**保留**既有字段缺失状态（不凭空写 single）。
    const repinNoModel = await repinIfBootstrapped({ projectRoot: target, skillRoot: target, boundary });
    assert.equal(repinNoModel?.ok, true, repinNoModel?.message ?? "");
    assert.equal(Object.prototype.hasOwnProperty.call(readAns(target), "governanceModel"), false);
  });

  await withRoot(async ({ target }) => {
    placeRole(target, "X");
    const boundary = seedLikeBoundary();

    // 创世态 + trio → 写出字段。
    const trio = await repinIfBootstrapped({
      projectRoot: target,
      skillRoot: target,
      boundary,
      governanceModel: "trio",
    });
    assert.equal(trio?.ok, true, trio?.message ?? "");
    assert.equal(readAns(target).governanceModel, "trio");

    // 非创世态重 pin（调用方不再传模型）：从当刻 `.ans` 读取并保留 trio，绝不降级为 single。
    const repin = await repinIfBootstrapped({ projectRoot: target, skillRoot: target, boundary });
    assert.equal(repin?.ok, true, repin?.message ?? "");
    assert.equal(readAns(target).governanceModel, "trio", "非创世重 pin 不得丢失既有模型");
  });
});

// ——————————————— ⑤ isGenesisState ———————————————

test("isGenesisState：无 .ans 为创世态；有 .ans 为非创世态", async () => {
  await withRoot(async ({ target }) => {
    mkdirSync(target, { recursive: true });
    assert.equal(await isGenesisState(target), true, "无 .ans → 创世态");
    mkdirSync(join(target, ".ans"), { recursive: true });
    writeFileSync(join(target, ANS_REL), "{}");
    assert.equal(await isGenesisState(target), false, "有 .ans → 非创世态");
  });
});
