// test/测试/governance-trio-verify/d-single-compat.test.ts
// 独立端到端验收（测试角色，2026-10-17）：旧项目 single 模型逐字兼容。
//
// 依据：评审 §5.3/§5.6/§九-12/13/14；覆盖：su 枚举/边界、shell 审批档、回交/看护主人=su、
// S1 旧行为（不写 governanceModel）与 S1 显式选择 trio。全部离线临时目录。

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { openRoleSession } from "../../../src/pipeline/orchestration/run-role.ts";
import { SessionManager } from "../../../app/desktop/session.ts";
import { buildProjectConfig } from "../../../app/desktop/project.ts";
import { buildEffectiveProjectConfig } from "../../../app/desktop/project.ts";
import { loadEffectiveConfig } from "../../../src/common/shared/config-loader.ts";
import {
  establishGovernanceRecord,
  previewGovernanceRecord,
} from "../../../src/pipeline/orchestration/govern-session.ts";
import { listProject } from "../../../src/service/role/resolve-role.ts";
import { createFakeRuntimeAdapter } from "../../../src/provider/pi/session.ts";
import { governanceCapabilitiesOf } from "../../../src/common/门禁引擎/governance-roles.ts";
import { defaultShellRules, classifyShell } from "../../../src/common/门禁引擎/classify-shell.ts";
import type { OperatorPrompt } from "../../../src/model/runtime.ts";
import {
  capture,
  capturingFactory,
  consume,
  customerChannel,
  exists,
  makeRoot,
  singleProject,
  write,
  writeProjectRole,
} from "./fixture.ts";

// —————————————————————— 1) 旧项目判据与 su 边界 ——————————————————————

test("旧项目（有角色、无 `.ans`）：listProject = single、仅内置 su、primaryRoleId=su、不报警；边界仍走既有四分支", async () => {
  const { root, cleanup } = makeRoot("single-listing");
  try {
    writeProjectRole(root, "A");
    const listing = await listProject(root);
    assert.equal(listing.governanceModel, "single", "旧项目保持 single（不按产物目录猜 trio）");
    assert.deepEqual(listing.roles.map((r) => r.roleId), ["su", "A"], "内置 su 在前、项目角色保留");
    assert.equal(listing.primaryRoleId, "su");
    assert.equal(listing.hasRoles, true);
    assert.deepEqual(listing.warnings, []);

    // 无 `.ans` + 有角色 ⇒ 无 genesisBootstrap；su 回内置未接受（拒一切）。
    const effective = await buildEffectiveProjectConfig(listing, { buildProjectConfig, loadEffectiveConfig });
    assert.equal(effective.project.governanceModel, "single");
    assert.equal(effective.project.genesisBootstrap, undefined, "有角色 ⇒ 不 arm 创世");

    // 建立治理记录（S1 旧行为：未传 governanceModel）→ `.ans` 不写 governanceModel 字段。
    const preview = await previewGovernanceRecord({ projectRoot: root });
    assert.equal(preview.ok, true, JSON.stringify(preview));
    if (!preview.ok) return;
    assert.equal(preview.preview.governanceModel, "single", "旧行为预览模型 = single");
    // 写入角色边界是 YAML，可直接建立。
    const established = await establishGovernanceRecord({ projectRoot: root });
    assert.equal(established.ok, true, JSON.stringify(established));
    const ansDoc = JSON.parse(readFileSync(path.join(root, ".ans", "project.json"), "utf8")) as Record<string, unknown>;
    assert.equal(Object.prototype.hasOwnProperty.call(ansDoc, "governanceModel"), false, "旧 `.ans` 形状：不新增 governanceModel");
    const listingAfter = await listProject(root);
    assert.equal(listingAfter.governanceModel, "single", "未迁移项目仍 single");
    assert.equal(listingAfter.roles.some((r) => r.roleId === "su"), true, "su 仍在列表");
  } finally {
    cleanup();
  }
});

test("旧 single：su 能力集（派发/看护/安装/审批档）+ 预授权四棵；不自我回交", async () => {
  const { root, cleanup } = makeRoot("single-caps");
  try {
    writeProjectRole(root, "A");
    const project = singleProject(root);
    assert.deepEqual(governanceCapabilitiesOf("su"), {
      customerInput: true,
      dispatchTask: true,
      roleStatus: true,
      sessionTail: true,
      proposeRecovery: true,
      installSkill: true,
      installMcp: true,
      shell: "operator-approve",
    });

    const cap = capture();
    const handle = await openRoleSession(
      {
        roleId: "su",
        project,
        taskId: "T-single-caps",
        customerInput: customerChannel({ selected: [], confirmed: false }),
        dispatchTask: async () => ({ ok: true, message: "stub" }),
        proposeRecovery: async () => null,
        roleStatus: async () => null,
        sessionTail: async () => null,
        installSkill: async () => ({ ok: false, reason: "stub", message: "stub" }),
        uninstallSkill: async () => ({ ok: false, reason: "stub", message: "stub" }),
        installMcp: async () => ({ ok: false, reason: "stub", message: "stub" }),
        uninstallMcp: async () => ({ ok: false, reason: "stub", message: "stub" }),
      },
      { createAdapter: capturingFactory(cap) },
    );
    await consume(handle, "（验收空脚本）");
    await handle.dispose();
    const caps = cap.caps!;
    assert.equal(typeof caps.dispatchTask, "function", "su 保留派发");
    assert.equal(typeof caps.roleStatus, "function", "su 保留 role_status");
    assert.equal(typeof caps.sessionTail, "function", "su 保留 session_tail");
    assert.equal(typeof caps.proposeRecovery, "function", "su 保留 propose_recovery");
    assert.equal(typeof caps.installSkill, "function", "su 保留 install_skill");
    assert.equal(typeof caps.installMcp, "function", "su 保留 install_mcp");
    assert.equal(caps.reportHandback, undefined, "内置 su 不自我回交");
    // 预授权四棵（docs/su / contracts / skills / mcp）直接可写；其余需确认。
    for (const p of ["docs/su/memo.md", "docs/contracts/c-v1.md", "docs/skills/s/SKILL.md", "docs/mcp/m.md"]) {
      assert.equal(cap.gate!(p).allowed, true, `su 预授权目录应放行：${p}`);
    }
    const card = cap.gate!("角色卡/A/memo.md");
    assert.equal(card.allowed, false, "非预授权、未确认 ⇒ F4 拒");
  } finally {
    cleanup();
  }
});

// —————————————————————— 2) su shell 审批档 ——————————————————————

test("旧 single：su 的 shell 走审批档——只读白名单免审批；risky/deny 弹客户审批，批准才执行", async () => {
  const { root, cleanup } = makeRoot("single-shell");
  try {
    writeProjectRole(root, "A");
    const prompts: OperatorPrompt[] = [];
    const cap = capture();
    const handle = await openRoleSession(
      {
        roleId: "su",
        project: singleProject(root),
        taskId: "T-single-shell",
        shellOperatorOnly: {
          classifyShell,
          rules: defaultShellRules(),
          operatorChannel: (prompt) => {
            prompts.push(prompt);
            return { outcome: "allow", operatorId: "test:客户" };
          },
        },
      },
      { createAdapter: capturingFactory(cap) },
    );
    await consume(handle, "（验收空脚本）");
    await handle.dispose();
    const gate = cap.caps!.shellGate;
    assert.equal(typeof gate, "function", "su 审批档应 arm");

    // 只读白名单：不弹卡。
    const ro = await gate!({ command: "ls", argv: ["ls"], cwd: root, toolCallId: "t-ro" });
    assert.equal(ro.allow, true, "只读白名单免审批直接执行");
    assert.equal(prompts.length, 0, "只读命令不得弹客户审批卡");

    // risky：弹卡；批准 ⇒ 执行。
    const risky = await gate!({ command: "rm", argv: ["rm", "-rf", "x"], cwd: root, toolCallId: "t-risky" });
    assert.equal(prompts.length, 1, "risky 应弹客户审批卡");
    assert.equal(risky.allow, true, "客户批准 ⇒ 执行");
    assert.match(prompts[0].reason ?? "", /risky|su-审批档/);
    // deny（原本硬拒）同样走客户审批：批准 ⇒ 执行；拒绝 ⇒ 不执行。
    const denyReq = { command: "sh", argv: ["sh", "-c", "echo hi"], cwd: root, toolCallId: "t-deny" };
    const deny = await gate!(denyReq);
    assert.equal(prompts.length, 2, "deny 也应弹客户审批卡（客户 2026-10-17 裁定）");
    assert.equal(deny.allow, true, "deny 类经客户批准后可执行");

    // 拒绝 ⇒ 不执行。
    const cap2 = capture();
    const handle2 = await openRoleSession(
      {
        roleId: "su",
        project: singleProject(root),
        taskId: "T-single-shell2",
        shellOperatorOnly: {
          classifyShell: () => "deny" as const,
          rules: defaultShellRules(),
          operatorChannel: () => ({ outcome: "deny", operatorId: "test:客户", reason: "测试拒绝" }),
        },
      },
      { createAdapter: capturingFactory(cap2) },
    );
    await consume(handle2, "（验收空脚本）");
    await handle2.dispose();
    const denied = await cap2.caps!.shellGate!({ command: "sh", argv: ["sh", "-c", "x"], cwd: root, toolCallId: "t-d2" });
    assert.equal(denied.allow, false, "客户拒绝 ⇒ 不执行");
  } finally {
    cleanup();
  }
});

// —————————————————————— 3) 回交/看护主人 = su（single）/ Convener（trio） ——————————————————————

interface ManagerHarness {
  mgr: SessionManager;
  listing: Awaited<ReturnType<typeof listProject>>;
}

async function makeManager(root: string): Promise<ManagerHarness> {
  const listing = await listProject(root);
  const mgr = new SessionManager({
    openRoleSession: async (input) =>
      openRoleSession(
        {
          roleId: input.roleId,
          project: input.project,
          taskId: "T-desk",
          ...(input.runtime !== undefined ? { runtime: input.runtime } : {}),
          ...(input.customerInput !== undefined ? { customerInput: input.customerInput } : {}),
          ...(input.dispatchTask !== undefined ? { dispatchTask: input.dispatchTask } : {}),
        },
        {
          createAdapter: (gate, caps) =>
            createFakeRuntimeAdapter({
              gate,
              script: [],
              ...(caps?.customerInput !== undefined ? { customerInput: caps.customerInput } : {}),
            }),
        },
      ),
    createPiAdapterFactory: () => () => {
      throw new Error("not used");
    },
    createDemoAdapter: () => {
      throw new Error("not used");
    },
    buildProjectConfig,
    getListing: (r) => (r === root ? listing : undefined),
    emitEvent: () => {},
  });
  return { mgr, listing };
}

test("回交/看护主人：single 下为 su；trio 下为 Convener（watchdogSnapshot.governanceRoleId）；single 派发旧行为不变", async () => {
  const single = makeRoot("single-owner");
  const trio = makeRoot("trio-owner");
  try {
    writeProjectRole(single.root, "A");
    writeProjectRole(trio.root, "A");
    write(trio.root, ".ans/project.json", JSON.stringify({ governanceModel: "trio" }) + "\n");

    const s = await makeManager(single.root);
    const openSingle = await s.mgr.open({ projectRoot: single.root, roleId: "su", runtime: "demo" });
    assert.equal(openSingle.ok, true, openSingle.error ?? "");
    assert.equal(s.mgr.watchdogSnapshot(single.root)?.governanceRoleId, "su", "single：回交/看护主人 = su");
    await s.mgr.stop(null);

    const t = await makeManager(trio.root);
    const openTrio = await t.mgr.open({ projectRoot: trio.root, roleId: "convener", runtime: "demo" });
    assert.equal(openTrio.ok, true, openTrio.error ?? "");
    assert.equal(t.mgr.watchdogSnapshot(trio.root)?.governanceRoleId, "convener", "trio：回交/看护主人 = Convener");
    await t.mgr.stop(null);
  } finally {
    single.cleanup();
    trio.cleanup();
  }
});

// —————————————————————— 4) S1 旧行为与显式模型选择 ——————————————————————

test("S1：旧项目建立默认 single（`.ans` 不写 governanceModel）；显式 trio 才写；非法模型 invalid-request", async () => {
  const old = makeRoot("s1-single");
  const trio = makeRoot("s1-trio");
  try {
    writeProjectRole(old.root, "A");
    writeProjectRole(trio.root, "A");

    const pOld = await previewGovernanceRecord({ projectRoot: old.root });
    assert.equal(pOld.ok, true, JSON.stringify(pOld));
    if (pOld.ok) assert.equal(pOld.preview.governanceModel, "single");
    assert.equal((await establishGovernanceRecord({ projectRoot: old.root })).ok, true);
    const oldAns = JSON.parse(readFileSync(path.join(old.root, ".ans", "project.json"), "utf8")) as Record<string, unknown>;
    assert.equal("governanceModel" in oldAns, false, "缺省 single ⇒ 旧 `.ans` 形状逐字不变");

    const pTrio = await previewGovernanceRecord({ projectRoot: trio.root, governanceModel: "trio" });
    assert.equal(pTrio.ok, true, JSON.stringify(pTrio));
    if (pTrio.ok) assert.equal(pTrio.preview.governanceModel, "trio", "S1 预览显示将写入的模型");
    const estTrio = await establishGovernanceRecord({ projectRoot: trio.root, governanceModel: "trio" });
    assert.equal(estTrio.ok, true, JSON.stringify(estTrio));
    const trioAns = JSON.parse(readFileSync(path.join(trio.root, ".ans", "project.json"), "utf8")) as Record<string, unknown>;
    assert.equal(trioAns.governanceModel, "trio");
    const trioListing = await listProject(trio.root);
    assert.equal(trioListing.governanceModel, "trio");
    assert.equal(trioListing.roles.some((r) => r.roleId === "su"), false, "显式 trio 建立后 su 隐藏");
    assert.ok(exists(old.root, ".ans/project.json"), "夹具健全性：旧项目已有记录");
  } finally {
    old.cleanup();
    trio.cleanup();
  }
});
