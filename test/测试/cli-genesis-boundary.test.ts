// test/测试/cli-genesis-boundary.test.ts
// 测试角色：CLI `ans govern <目录>` **创世态**下 su 的可写面（**跨角色联调**：装配注入形态 × 门禁判定 × 编排会话）。
//
// 归属：test/测试/（本角色 Section 1）。行文依据：本角色提案
// `角色卡/测试/docs/fix/2026-10-12_fix_runcli-credential-leak-and-govern-cli-cases.md`（客户 2026-10-12 批准 M3 + O1）。
// 为什么在本目录（而非装配/编排自有用例）：这条链横跨三家各有的钉子都不覆盖的组合——
// 装配钉「注入形态与落盘」、编排钉「确认制/自动收尾接线」、门禁钉「单元判定」；「组合后在 CLI `<目录>`
// 创世态下，su 的可写面确实只有三处治理产物、src 与两类逃逸确被拒，且确认制下随确认走完自动收尾」
// 是本文件钉的联调缺口。
//
// 覆盖：
//  1) M3-判定面：loadInjection(空目录) 注入 → su 边界**恰 3 条**（角色卡//docs//.ans/，accepted）；
//     resolveWrite：src/**、词法逃逸（角色卡/../src）、真实路径逃逸（../.. 出根）、根外绝对路径全拒；
//     三处治理产物放行（scope=undefined，即 CLI 创世会话的真实形态）。
//  2) M3-链路面（2026-10-12 A-3/A-4 新语义重写）：governCommand + 假适配器 + **确认桩**——su 先经
//     `request_confirmation` 预览获确认，随后越界写被拒**不落盘**、已确认的治理产物**真落盘**并经
//     **自动收尾**写出 `.ans`/治理边界文档/manifest，命令以 0 结束。
//  3) O1 角落：有 `角色卡/` 但无 `.ans` → CLI 仍以「无 `.ans`」arm 创世（带 genesisBootstrap），
//     且可写面仍只落三处治理产物。**客户 2026-10-12 裁定**：判据差（CLI「无 .ans」vs 桌面 hasRoles）
//     **维持现状**——operator 显式发起、种子有界（仅 角色卡//docs//.ans/）、非静默；**桌面对齐另行评估（另议）**。
//
// 全部用系统临时目录，用后清理；假适配器驱动，不发任何模型请求、不读任何真实凭据。

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, after } from "node:test";

import { loadInjection } from "../../src/index.ts";
import { listProject, resolveRole } from "../../src/service/role/resolve-role.ts";
import { resolveWrite } from "../../src/service/gate/resolve-write.ts";
import { governCommand } from "../../src/interface/cli/govern.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import type { CustomerInputFn, ToolCall } from "../../src/provider/pi/session.ts";

const ROOT = mkdtempSync(join(tmpdir(), "ans-cli-genesis-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略清理失败 */
  }
});

function newDir(name: string): string {
  return mkdtempSync(join(ROOT, name));
}

/** 计次确认桩（形状=契约家 session.ts 的 `CustomerInputFn`）：客户**恰好确认**，不读终端。 */
function countingConfirm(): { channel: CustomerInputFn; calls: () => number } {
  let n = 0;
  return {
    calls: () => n,
    channel: () => {
      n++;
      return { outcome: "answered", value: { confirmed: true }, operatorId: "test:测试确认桩" };
    },
  };
}

// ————————— 1) M3-判定面：创世上界恰为三处治理产物；src 与两类逃逸全拒 —————————

test("创世判定面：空目录注入的 su 边界恰 3 条；src/**、词法/真实路径逃逸、根外绝对路径全拒", async () => {
  const dir = newDir("judge-");
  const { project, configSource } = await loadInjection(dir);
  assert.equal(configSource.kind, "builtin-fallback", "空目录无 .ans → 内置回退（CLI 创世的触发条件）");

  const resolved = await resolveRole("su", project);
  const b = resolved.boundary;
  assert.equal(b.acceptance.accepted, true, "创世授权由操作者命令发起（accepted）");
  assert.equal(b.parseError, undefined, "不得带解析错误");
  assert.deepEqual(
    b.entries.map((e) => `${e.kind}:${e.root}:${e.path}`).sort(),
    ["directory:project:.ans/", "directory:project:docs/", "directory:project:角色卡/"].sort(),
    "su 的边界必须恰为三处治理产物（多一条都是越界）",
  );

  const ctx = { skillRoot: project.skillRoot, projectRoot: project.projectRoot };
  // scope=undefined：CLI 创世会话的真实形态（无条件目录、空可写集 ⇒ 不做 F4 收窄，只看边界）。
  const denied = [
    "src/index.ts",
    "src/common/门禁引擎/boundary-core.ts",
    "角色卡/../src/x.ts", // 词法逃逸：规范化后落在 src/
    "../../../etc/passwd", // 真实路径逃逸：出 project 根
    "/etc/passwd", // 根外绝对路径
  ];
  for (const p of denied) {
    const d = resolveWrite(p, b, undefined, ctx);
    assert.equal(d.allowed, false, `越界路径必须被拒：${p}（实际：allowed）`);
    assert.ok(typeof d.reason === "string" && d.reason.length > 0, `拒绝须如实给理由：${p}`);
  }
  const allowed = ["角色卡/X/role-card.md", "docs/design/x.md", ".ans/project.json"];
  for (const p of allowed) {
    assert.equal(resolveWrite(p, b, undefined, ctx).allowed, true, `治理产物路径应放行：${p}`);
  }
});

// ————————— 2) M3-链路面（确认制）：越界不落盘、确认后真落盘并自动收尾、命令 0 —————————

test("创世链路面（确认制）：governCommand + 假适配器 + 确认桩——越界写入不落盘、确认后的治理产物真落盘并经自动收尾转正、命令以 0 结束", async () => {
  const dir = newDir("chain-");
  const inj = await loadInjection(dir);
  const preview = ["将创建角色 X，写出：", "角色卡/X/role-card.md", "角色卡/X/boundary.yaml"].join("\n");
  const script: ToolCall[] = [
    // 未确认先试写：越界（src/）——应在写入之前被拒。
    { name: "write_file", args: { path: "src/evil.ts", content: "// 越界\n" } },
    // 先经客户确认（A-1）：预览列出将写路径 → 编排发行进 writeSet。
    { name: "request_confirmation", args: { title: "创建角色 X（预览）", preview } },
    { name: "write_file", args: { path: "角色卡/X/role-card.md", content: "# 角色：X\n" } },
    { name: "write_file", args: { path: "角色卡/X/boundary.yaml", content: "role: X\nentries: []\n" } },
  ];
  const { channel, calls } = countingConfirm();
  const code = await governCommand(["govern", dir], {
    ...inj,
    createAdapter: (gate, caps) =>
      createFakeRuntimeAdapter({ gate, script, writeRoot: dir, customerInput: caps?.customerInput }),
    customerInput: channel,
  });
  assert.equal(code, 0, "拒绝属常规判定，会话应照常走完");
  assert.equal(calls(), 1, "su 应先经确认桩取得确认（恰一次）");
  assert.equal(existsSync(join(dir, "src")), false, "越界写入不得落盘（整棵 src/ 都不该出现）");
  assert.ok(existsSync(join(dir, "角色卡", "X", "role-card.md")), "确认后的写入应真落盘");
  assert.ok(existsSync(join(dir, "角色卡", "X", "boundary.yaml")), "确认后的写入应真落盘");
  // 自动收尾（A-4）：settle 后转正——写 .ans + 治理边界文档 + manifest。
  assert.ok(existsSync(join(dir, ".ans", "project.json")), "自动收尾应写出 .ans/project.json");
  assert.ok(existsSync(join(dir, "角色卡", "governance-boundary.yaml")), "自动收尾应写出治理边界文档");
  assert.ok(existsSync(join(dir, "docs", "bootstrap-manifest.md")), "自动收尾应写出 docs/bootstrap-manifest.md");
});

// ————————— 3) O1 角落：有 角色卡/ 无 .ans → CLI 仍 arm（客户裁定维持现状） —————————

test("角落（O1，客户 2026-10-12 裁定维持现状）：有 角色卡/ 但无 .ans → CLI 仍 arm 创世；可写面仍只落三处治理产物", async () => {
  const dir = newDir("corner-");
  mkdirSync(join(dir, "角色卡", "X"), { recursive: true });
  writeFileSync(join(dir, "角色卡", "X", "role-card.md"), "# 角色：X\n", "utf8");
  writeFileSync(join(dir, "角色卡", "X", "boundary.yaml"), "role: X\nentries: []\n", "utf8");

  // 先如实呈现这个角落为何是「差异」：桌面判据（hasRoles）在此为 true ⇒ 桌面**不会** arm。
  const listing = await listProject(dir);
  assert.equal(listing.hasRoles, true, "桌面判据（能枚举到项目角色）在此角落为 true");

  const { project, configSource } = await loadInjection(dir);
  assert.equal(configSource.kind, "builtin-fallback", "无 .ans → 内置回退（CLI 判据的由来：无 .ans ≠ 无角色）");
  assert.ok(
    project.genesisBootstrap !== undefined,
    "裁定（2026-10-12）：CLI 仍以「无 .ans」arm 创世——与桌面 hasRoles 判据的差异维持现状；桌面对齐另议",
  );

  const resolved = await resolveRole("su", project);
  const b = resolved.boundary;
  assert.equal(b.entries.length, 3, "即便此角落，创世种子仍恰为三处治理产物");
  const ctx = { skillRoot: project.skillRoot, projectRoot: project.projectRoot };
  assert.equal(resolveWrite("src/evil.ts", b, undefined, ctx).allowed, false, "src/** 仍必须被拒");
  assert.equal(
    resolveWrite("角色卡/X/memo.md", b, undefined, ctx).allowed,
    true,
    "裁定维持的现状语义：su 可改既有角色文件（仍被「角色卡/」这一处治理产物圈住）",
  );
});
