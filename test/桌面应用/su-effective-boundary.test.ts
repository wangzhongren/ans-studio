// test/桌面应用/su-effective-boundary.test.ts
// 桌面应用：**已 bootstrap 项目里 `.ans` 的项目治理边界路径被采纳**——内置治理角色（su）的**生效边界**
// 即项目治理边界（gate 放行其条目内的写、拒绝条目外的写）。这是「桌面丢弃 `.ans` 项目治理边界路径」那处
// bug 的修复证据（修复点在 `app/desktop/project.ts::buildEffectiveProjectConfig`）。
//
// 背景（修复前）：桌面从 `.ans` 载入后**只采纳 `source.acceptance`**、**丢弃了项目治理边界路径**
// （`loaded.project.governanceBoundary.path`），而 `buildProjectConfig` 又把它**硬写成空串** ⇒
//   · 门禁 `resolveBoundarySection` 的「**治理边界覆盖**」分支被跳过 ⇒ su 掉回**内置未接受**（skill 根边界）
//     ⇒ **拒一切写**——bootstrap 建出的治理结构在桌面上成了空的。
//
// 本用例造一个**真的已 bootstrap 的项目**（有 `.ans`、有治理边界路径、pin 正确），用**真实**共享载入器 +
// 真实门禁引擎 + 真实编排验证：① 界面**不**再派生任何「只读」标记（`RoleView` 无该字段——客户已裁定移除）；
// ② 引擎解析出 su 的生效边界为**已接受**；③ su 的 gate **放行其治理边界内的写**、**拒绝边界外的写**。
//
// 用例用**系统临时目录**，跑完清理，**不在仓库里留文件**。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { after } from "node:test";

import type { WriteGate } from "../../src/provider/pi/session.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { loadEffectiveConfig } from "../../src/common/shared/config-loader.ts";
import { listProject, resolveRole } from "../../src/service/role/resolve-role.ts";
import {
  buildProjectConfig,
  buildEffectiveProjectConfig,
} from "../../app/desktop/project.ts";
import { createDesktopInterface } from "../../app/desktop/interface.ts";

const ROOT = mkdtempSync(join(tmpdir(), "ans-desktop-su-effective-"));
after(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

const ROLE_ID = "某角色";
const ROLE_BOUNDARY_REL = `角色卡/${ROLE_ID}/boundary.yaml`;
const GOV_REL = "角色卡/governance-boundary.yaml";
// 项目治理边界文档：以 project 根声明两个普通目录。su 由它治理 ⇒ 其条目内放行、`src/**` 拒。
const GOV_YAML =
  "role: governance\nentries:\n" +
  "  - kind: directory\n    path: 角色卡/\n    purpose: 角色目录\n" +
  "  - kind: directory\n    path: docs/\n    purpose: 项目文档\n";
const ROLE_BOUNDARY_YAML = "role: R\nentries:\n  - kind: file\n    path: src/r.ts\n    purpose: t\n";

function writeAt(root: string, rel: string, text: string): string {
  const abs = join(root, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text, "utf8");
  return abs;
}
function sha256OfFile(abs: string): string {
  return createHash("sha256").update(readFileSync(abs)).digest("hex");
}

/**
 * 造一个**已 bootstrap** 的项目（一个项目角色 + 治理边界文档）；`withAns` 为真时再写一份**pin 正确**的
 * `.ans/project.json`（`governanceBoundary.path` 指向治理边界文档）。返回根。
 */
function bootstrappedProject(withAns: boolean): string {
  const root = mkdtempSync(join(ROOT, "proj-"));
  writeAt(root, `角色卡/${ROLE_ID}/role-card.md`, `# 角色：${ROLE_ID}\n\n测试用项目角色。\n`);
  writeAt(root, ROLE_BOUNDARY_REL, ROLE_BOUNDARY_YAML);
  const govAbs = writeAt(root, GOV_REL, GOV_YAML);
  if (withAns) {
    const doc = {
      roles: { [ROLE_ID]: { card: `角色卡/${ROLE_ID}/role-card.md`, boundary: ROLE_BOUNDARY_REL } },
      governanceBoundary: {
        path: GOV_REL,
        acceptance: {
          accepted: true,
          source: "客户 pin 2026-10-11",
          pin: [{ path: GOV_REL, sha256: sha256OfFile(govAbs) }],
        },
      },
    };
    writeAt(root, ".ans/project.json", JSON.stringify(doc, null, 2));
  }
  return root;
}

/** 用**真实**下游（共享载入器 + 门禁引擎 + 编排）构造桌面 Interface（不注入替身）。 */
function makeInterface() {
  return createDesktopInterface({ pickDirectory: async () => null, emitEvent: () => {} });
}

/** 经真实 openRoleSession 取到 su 的 gate（假适配器捕获 gate；不落盘、不调模型）。 */
async function captureSuGate(listing: Awaited<ReturnType<typeof listProject>>): Promise<WriteGate> {
  const { project } = await buildEffectiveProjectConfig(listing, {
    buildProjectConfig,
    loadEffectiveConfig,
  });
  let captured: WriteGate | undefined;
  await openRoleSession(
    { roleId: listing.primaryRoleId, project }, // scope 省略 = undefined（普通聊天）
    {
      createAdapter: (gate: WriteGate) => {
        captured = gate;
        return createFakeRuntimeAdapter({ gate });
      },
    },
  );
  assert.ok(captured, "应经 createAdapter 捕获到 su 会话的 gate");
  return captured!;
}

// ————————————————— ① `.ans` 治理边界路径被采纳 → RoleView **不再**派生「只读」标记（客户已裁定移除） —————————————————

test("已 bootstrap + 有效 .ans（治理边界 pin-backed）→ 界面不再派生「只读」标记（RoleView 无该字段）", async () => {
  const root = bootstrappedProject(true);
  const res = await makeInterface().listProject({ projectRoot: root });
  assert.equal(res.hasRoles, true, "应枚举到项目角色（已 bootstrap）");
  const su = res.roles.find((r) => r.roleId === res.primaryRoleId);
  assert.ok(su && su.builtIn, "主入口应为内置治理角色");
  // 守卫「它不该出现」：角色数据里**没有** readOnly 字段（客户 2026-10-11 裁定移除只读徽标/内联提示）。
  assert.equal("readOnly" in (su as object), false, "su 不应再有 readOnly 字段（只读徽标已移除）");

  // 项目角色同样不带该字段。
  const role = res.roles.find((r) => r.roleId === ROLE_ID);
  assert.ok(role);
  assert.equal("readOnly" in (role as object), false, "项目角色不应再有 readOnly 字段");
});

// ————————————————— ② 引擎解析出 su 的**生效边界**为已接受 —————————————————

test("已 bootstrap + 有效 .ans → 引擎为 su 解析出的生效边界为**已接受**（治理边界覆盖）", async () => {
  const root = bootstrappedProject(true);
  const listing = await listProject(root);
  const { project } = await buildEffectiveProjectConfig(listing, {
    buildProjectConfig,
    loadEffectiveConfig,
  });
  assert.equal(
    project.governanceBoundary?.path,
    GOV_REL,
    "生效配置须采纳 .ans 的项目治理边界路径（此前被丢弃的根因）",
  );
  const resolved = await resolveRole(listing.primaryRoleId, project);
  assert.equal(resolved.boundary.acceptance.accepted, true, "su 的生效边界应由项目治理边界给出、且已接受");
});

// ————————————————— ③ su 的 gate：治理边界内放行、边界外拒绝 —————————————————

test("已 bootstrap + 有效 .ans → su 的 gate 放行其**治理边界内**的写、拒绝边界外的写", async () => {
  const root = bootstrappedProject(true);
  const listing = await listProject(root);
  const gate = await captureSuGate(listing);

  const inGov = gate("角色卡/新角色/role-card.md");
  assert.equal(inGov.allowed, true, "治理边界（角色卡/）内的写应放行——su 按项目治理边界工作");
  const inDocs = gate("docs/design/x.md");
  assert.equal(inDocs.allowed, true, "docs/ 属治理边界，应放行");

  const out = gate("src/evil.ts");
  assert.equal(out.allowed, false, "项目治理边界之外的写必须被拒（门禁仍把关）");
});

// ————————————————— ④ 反例：无 `.ans` 的已 bootstrap 项目里 su 回退内置未接受（写入被拒） —————————————————

test("已 bootstrap 但**无** .ans → su 回退内置未接受（写入被拒；该路径不变）", async () => {
  const root = bootstrappedProject(false);
  const listing = await listProject(root);
  const { project } = await buildEffectiveProjectConfig(listing, {
    buildProjectConfig,
    loadEffectiveConfig,
  });
  assert.equal(project.governanceBoundary?.path, "", "无 .ans → 治理边界路径为空（走原有回退）");
  assert.equal(
    (await resolveRole(listing.primaryRoleId, project)).boundary.acceptance.accepted,
    false,
    "无 .ans 时 su 回退内置未接受（写入被拒）",
  );

  const res = await makeInterface().listProject({ projectRoot: root });
  const su = res.roles.find((r) => r.roleId === res.primaryRoleId);
  assert.ok(su);
  assert.equal("readOnly" in (su as object), false, "su 不应再有 readOnly 字段（只读徽标已移除）");
});
