// test/桌面应用/genesis-bootstrap.test.ts
// 桌面窗口（T30）：**冷启动创世接线**的验证——未 bootstrap 的空项目上，su 能否写出治理产物。
//
// 依据：设计 §12.2（核心裁决）——
//   · 门口放在**边界选择层**：未 bootstrap（`hasRoles === false`）时 `ProjectConfig` 设 `genesisBootstrap`；
//   · su 的会话 `scope` 保持 `undefined`（普通聊天）；
//   · 门禁引擎 `resolveBoundarySection` 据此对**内置治理角色**返回「项目根」治理种子边界
//     （普通目录 `角色卡/`、`docs/`、`.ans/`）⇒ 命中即放行、`src/**` 拒；
//   · **切换条件**：项目一有角色（`hasRoles === true`）就不再设该字段（双保险之一；另一重是门禁引擎的
//     结构性自终止）。
//
// 用例用**系统临时目录**造假空项目，跑完清理，**不在仓库里留文件**。

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after } from "node:test";
import { fileURLToPath } from "node:url";

import type { ProjectConfig } from "../../src/model/role.ts";
import type { WriteGate } from "../../src/provider/pi/session.ts";
import { createFakeRuntimeAdapter } from "../../src/provider/pi/session.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import { listProject } from "../../src/service/role/resolve-role.ts";
import { buildProjectConfig } from "../../app/desktop/project.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const TMP = mkdtempSync(join(tmpdir(), "ans-desktop-genesis-"));
after(() => {
  try {
    rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
});

/** 造一个**空**项目目录（无 角色卡/ ⇒ hasRoles:false，即「未 bootstrap」）。 */
function emptyProject(): string {
  return mkdtempSync(join(TMP, "empty-"));
}

const ACCEPTED = { accepted: true, source: "unit-test:desktop-app" } as const;

// ————————————————— ① buildProjectConfig：未 bootstrap 时带 genesisBootstrap，有角色时不带 —————————————————

test("未 bootstrap（hasRoles:false）→ ProjectConfig 带 genesisBootstrap，source 如实记录操作者授权来源", async () => {
  const root = emptyProject();
  const listing = await listProject(root);
  assert.equal(listing.hasRoles, false, "空项目应枚举为未 bootstrap");
  assert.equal(listing.primaryRoleId, "su", "主入口为门禁引擎枚举给出的内置治理角色");

  const cfg = buildProjectConfig(listing, { ...ACCEPTED }, { ANS_SKILL_ROOT: "/x/skill" });
  assert.ok(cfg.genesisBootstrap, "未 bootstrap 必须带 genesisBootstrap（否则 su 一个字也写不了）");
  const src = cfg.genesisBootstrap!.source;
  assert.ok(src.includes("desktop-app"), "source 须如实标注 desktop-app（操作者授权来源）");
  assert.ok(src.includes(listing.primaryRoleId), "source 须含 primaryRoleId（不硬编码 su）");
  assert.ok(/bootstrap/.test(src), "source 须点明这是 bootstrap 授权");
});

test("已 bootstrap（hasRoles:true，真实仓库根）→ ProjectConfig **不带** genesisBootstrap（切换条件）", async () => {
  const listing = await listProject(REPO_ROOT);
  assert.equal(listing.hasRoles, true, "真实仓库根应有项目角色");
  const cfg = buildProjectConfig(listing, { ...ACCEPTED }, { ANS_SKILL_ROOT: "/x/skill" });
  assert.equal(cfg.genesisBootstrap, undefined, "有角色即不得带 genesisBootstrap（改由项目边界治理）");
  assert.ok(!("genesisBootstrap" in cfg), "键本身也不应出现（而非显式 undefined）");
});

// ————————————————— ② gate 直接判：未 bootstrap 时 su 的写入——治理产物放行、src/** 拒 —————————————————

/** 经真实 openRoleSession 取到会话的 gate（用假适配器捕获 gate；不落盘、不调模型）。 */
async function captureSuGate(root: string): Promise<WriteGate> {
  const listing = await listProject(root);
  assert.equal(listing.hasRoles, false);
  const project: ProjectConfig = buildProjectConfig(listing, { ...ACCEPTED }, { ANS_SKILL_ROOT: "/x/skill" });
  let captured: WriteGate | undefined;
  await openRoleSession(
    { roleId: "su", project }, // scope 省略 = undefined（普通聊天）
    {
      createAdapter: (gate: WriteGate) => {
        captured = gate;
        return createFakeRuntimeAdapter({ gate });
      },
    },
  );
  assert.ok(captured, "应经 createAdapter 捕获到会话的 gate");
  return captured!;
}

test("未 bootstrap：su 的 gate 放行治理产物 角色卡/<新角色>/{role-card.md,boundary.yaml}（scope:undefined 下命中即放行）", async () => {
  const root = emptyProject();
  const gate = await captureSuGate(root);

  const card = gate("角色卡/新角色/role-card.md");
  assert.equal(card.allowed, true, "su 应能写出新角色的 role-card.md（有界创世授权）");
  const boundary = gate("角色卡/新角色/boundary.yaml");
  assert.equal(boundary.allowed, true, "su 应能写出新角色的 boundary.yaml");
});

test("未 bootstrap：su 的 gate 放行 docs/ 与 .ans/ 治理产物", async () => {
  const root = emptyProject();
  const gate = await captureSuGate(root);
  assert.equal(gate("docs/design/x.md").allowed, true, "docs/ 属治理产物，应放行");
  assert.equal(gate(".ans/project.json").allowed, true, ".ans/ 属治理产物，应放行");
});

test("未 bootstrap：su 的 gate **拒绝** src/**（非治理产物）与项目根之外的绝对路径", async () => {
  const root = emptyProject();
  const gate = await captureSuGate(root);

  const src = gate("src/evil.ts");
  assert.equal(src.allowed, false, "src/** 不在种子边界内，必须被拒");
  assert.ok((src.reason || "").length > 0, "拒绝须给出原因");

  // 绝对路径指向项目根之外 → 不在任何受治理根内 → 拒。
  const outside = gate(join(TMP, "outside.txt"));
  assert.equal(outside.allowed, false, "项目根之外的绝对路径必须被拒");
});

// ————————————————— ③ 反例：已 bootstrap 时同一写入被拒（切换条件生效，su 回到普通聊天） —————————————————

test("已 bootstrap（有角色）：su 的 gate 拒绝 角色卡/<新角色>/role-card.md（不再有创世授权）", async () => {
  // 真实仓库根有角色 ⇒ buildProjectConfig 不带 genesisBootstrap ⇒ su 走内置边界（未接受，skill 根）
  // ⇒ 对项目根相对路径 角色卡/… 不匹配任何条目 → 拒。
  const listing = await listProject(REPO_ROOT);
  const project: ProjectConfig = buildProjectConfig(listing, { ...ACCEPTED }, { ANS_SKILL_ROOT: "/x/skill" });
  assert.equal(project.genesisBootstrap, undefined);

  let captured: WriteGate | undefined;
  await openRoleSession(
    { roleId: "su", project },
    {
      createAdapter: (gate: WriteGate) => {
        captured = gate;
        return createFakeRuntimeAdapter({ gate });
      },
    },
  );
  const decision = captured!("角色卡/新角色/role-card.md");
  assert.equal(decision.allowed, false, "有角色后 su 不得再写项目根下的角色产物（走项目边界/普通聊天）");
});
