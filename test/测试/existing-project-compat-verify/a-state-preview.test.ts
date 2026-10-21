// test/测试/existing-project-compat-verify/a-state-preview.test.ts
// 测试角色：已有角色但无治理记录的项目兼容（B+C V1）——**A. 状态与预览**独立验证（2026-10-17）。
//
// 覆盖（任务书 §A / PM 评审 §六 V1、N1/N2/N4/N5/N6/N8 检测面）：
//   · S1：N 个角色（role-card.md + 仅 boundary.md）、无 `.ans` → `governanceRecord.state === "missing"`
//     且 `hasRoles === true`；列举前后目录树与 mtime 不变（V1 零写入）。
//   · `.ans` 有效 → present；非法 JSON / accepted:true 无 pin → invalid + reason（N1/N2 检测面）。
//   · preview：三写路径、pin 列表、roleIds、adoptExistingGovernanceDoc、legacyBoundaryRoleIds。
//   · S1b（既有 `角色卡/governance-boundary.yaml`）→ adopt=true；坏治理文档 → unparseable-governance-doc
//     且零写入（N4）；无角色 → no-roles；`.ans` 已存在 → already-established / invalid-record。
//   · 桌面 Interface 守卫：非当前导入项目 → invalid-request（不调机制）。
//
// 独立构造：夹具自建（见 fixture.ts），断言只依赖产品公开面与本角色自算事实；**import 零实施方测试文件**。

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { governanceActionFor } from "../../../app/renderer/src/chat/governance-view.ts";

import {
  makeS1Project,
  makeEmptyProject,
  makeDesktop,
  writeUsableAns,
  writeRealPinnedAns,
  snapshotTree,
  governanceDocYaml,
  effectiveOf,
  GOV_REL,
  ANS_REL,
  F6_FIRST_SENTENCE,
} from "./fixture.ts";
import { previewGovernanceRecord } from "../../../src/pipeline/orchestration/govern-session.ts";
import { resolveBoundarySection } from "../../../src/common/门禁引擎/boundary-core.ts";
import { resolveWrite } from "../../../src/service/gate/resolve-write.ts";

const GOV_WRITE_ORDER_S1 = [GOV_REL, ANS_REL, "docs/bootstrap-manifest.md"];
const WRITE_ORDER_S1B = [ANS_REL, "docs/bootstrap-manifest.md"];

/** 项目角色 pin 路径（legacy 夹具口径）。 */
function rolePinPaths(root: string, ids: string[]): string[] {
  return ids.map((id) => {
    const name = fs.existsSync(path.join(root, "角色卡", id, "boundary.yaml")) ? "boundary.yaml" : "boundary.md";
    return `角色卡/${id}/${name}`;
  });
}

test("A1 S1：N 个角色（role-card.md + 仅 boundary.md）、无 .ans → missing + hasRoles=true；列举零写入", async () => {
  const fx = makeS1Project();
  try {
    const before = snapshotTree(fx.root);
    const { iface } = makeDesktop(fx.root);
    const listing = await iface.listProject({ projectRoot: fx.root });
    const after = snapshotTree(fx.root);

    assert.equal(listing.hasRoles, true, "S1 前置：hasRoles 必须为 true（否则属 S0，不是本次场景）");
    assert.equal(listing.governanceRecord.state, "missing");
    assert.equal(listing.governanceRecord.reason, undefined);
    // 夹具按客户现场形状构造：每个角色目录 role-card.md + 仅 boundary.md。
    for (const id of fx.ids) {
      assert.equal(fs.existsSync(path.join(fx.root, "角色卡", id, "role-card.md")), true);
      assert.equal(fs.existsSync(path.join(fx.root, "角色卡", id, "boundary.md")), true);
      assert.equal(fs.existsSync(path.join(fx.root, "角色卡", id, "boundary.yaml")), false);
    }
    assert.equal(fs.existsSync(path.join(fx.root, ANS_REL)), false);
    assert.deepEqual(after, before, "V1：导入/列举不得写任何文件或改 mtime");
  } finally {
    fx.cleanup();
  }
});

test("A2 .ans 有效（真实 pin 全部一致）→ present；pin 逐文件校验通过且列举零写入", async () => {
  const fx = makeS1Project();
  try {
    // 2026-10-17 语义变更：pin 逐文件校验接入后，只有**真实哈希全部一致**才是 present。
    writeRealPinnedAns(fx.root, fx.ids);
    const before = snapshotTree(fx.root);
    const { iface } = makeDesktop(fx.root);
    const listing = await iface.listProject({ projectRoot: fx.root });
    const after = snapshotTree(fx.root);
    assert.equal(listing.governanceRecord.state, "present");
    assert.equal(listing.governanceRecord.reason, undefined);
    assert.equal(listing.governanceRecord.pinFiles, undefined, "present 不携带 pinFiles 明细");
    assert.deepEqual(after, before, "pin 证据检查只读：列举前后目录树与 mtime 不变");
  } finally {
    fx.cleanup();
  }
});

test("A3 N1：.ans 非法 JSON → invalid + reason（载入器降级原文，不含凭据）", async () => {
  const fx = makeS1Project();
  try {
    fs.mkdirSync(path.join(fx.root, ".ans"), { recursive: true });
    fs.writeFileSync(path.join(fx.root, ANS_REL), "{ this is not json ", "utf8");
    const { iface } = makeDesktop(fx.root);
    const listing = await iface.listProject({ projectRoot: fx.root });
    assert.equal(listing.governanceRecord.state, "invalid");
    assert.equal(typeof listing.governanceRecord.reason, "string");
    assert.ok(
      (listing.governanceRecord.reason ?? "").length > 0,
      "N1：invalid 必须给出 reason（载入器 downgradeReason）",
    );
    assert.match(listing.governanceRecord.reason ?? "", /不可解析|fail-closed/i);
  } finally {
    fx.cleanup();
  }
});

test("A4 N2：.ans 合法但 accepted:true 无 pin → invalid + reason（终态规则降级）", async () => {
  const fx = makeS1Project();
  try {
    const roles: Record<string, { card: string; boundary: string }> = {};
    for (const id of fx.ids) roles[id] = { card: `角色卡/${id}/role-card.md`, boundary: `角色卡/${id}/boundary.md` };
    fs.mkdirSync(path.join(fx.root, ".ans"), { recursive: true });
    fs.writeFileSync(
      path.join(fx.root, ANS_REL),
      JSON.stringify(
        {
          projectRoot: fx.root.split(path.sep).join("/"),
          skillRoot: fx.root.split(path.sep).join("/"),
          roles,
          governanceBoundary: {
            path: GOV_REL,
            acceptance: { accepted: true, source: "test:声明 accepted 但无 pin" },
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    const { iface } = makeDesktop(fx.root);
    const listing = await iface.listProject({ projectRoot: fx.root });
    assert.equal(listing.governanceRecord.state, "invalid");
    assert.match(listing.governanceRecord.reason ?? "", /未提供 pin|无 pin|pin/i);
  } finally {
    fx.cleanup();
  }
});

test("A5 preview（S1）：三写路径 / pin 列表 / roleIds / adopt=false / legacy 提示；零写入", async () => {
  const fx = makeS1Project(["alpha", "beta", "gamma"], ["beta"]); // beta 用 boundary.yaml，其余 legacy .md
  try {
    const before = snapshotTree(fx.root);
    const res = await previewGovernanceRecord({ projectRoot: fx.root });
    const after = snapshotTree(fx.root);

    assert.equal(res.ok, true);
    if (!res.ok) return;
    const p = res.preview;
    assert.equal(p.projectRoot, fx.root);
    assert.equal(p.governanceBoundaryRel, GOV_REL);
    assert.deepEqual(p.writePaths, GOV_WRITE_ORDER_S1, "写入顺序＝治理文档 → .ans → manifest");
    assert.deepEqual(p.roleIds, ["alpha", "beta", "gamma"], "roleIds 如实取枚举结果（缺件角色不在此列）");
    assert.deepEqual(
      p.pinPaths,
      [GOV_REL, ...rolePinPaths(fx.root, ["alpha", "beta", "gamma"])],
      "pin＝治理文档 + 全部可 pin 角色边界",
    );
    assert.equal(p.adoptExistingGovernanceDoc, false);
    assert.equal(typeof p.acceptanceSource, "string");
    assert.ok(p.acceptanceSource.length > 0, "授权来源必须逐字展示");
    assert.deepEqual(p.legacyBoundaryRoleIds, ["alpha", "gamma"], "legacy 提示恰为 boundary.md 角色");
    assert.deepEqual(after, before, "预览零写入（含 mtime）");
  } finally {
    fx.cleanup();
  }
});

test("A6 preview（S1b）：既有治理边界文档 → adopt=true，不覆盖；写路径不含治理文档", async () => {
  const fx = makeS1Project();
  try {
    fs.mkdirSync(path.join(fx.root, "角色卡"), { recursive: true });
    fs.writeFileSync(path.join(fx.root, GOV_REL), governanceDocYaml(), "utf8");
    const before = snapshotTree(fx.root);
    const res = await previewGovernanceRecord({ projectRoot: fx.root });
    const after = snapshotTree(fx.root);

    assert.equal(res.ok, true);
    if (!res.ok) return;
    assert.equal(res.preview.adoptExistingGovernanceDoc, true);
    assert.deepEqual(res.preview.writePaths, WRITE_ORDER_S1B);
    assert.deepEqual(res.preview.pinPaths, [GOV_REL, ...rolePinPaths(fx.root, fx.ids)]);
    assert.deepEqual(after, before, "预览不得覆盖既有治理文档（字节与 mtime 不变）");
  } finally {
    fx.cleanup();
  }
});

test("A7 N4：坏治理边界文档（entries: []）→ unparseable-governance-doc 且零写入", async () => {
  const fx = makeS1Project();
  try {
    fs.mkdirSync(path.join(fx.root, "角色卡"), { recursive: true });
    fs.writeFileSync(path.join(fx.root, GOV_REL), "role: 治理边界\nentries: []\n", "utf8");
    const before = snapshotTree(fx.root);
    const res = await previewGovernanceRecord({ projectRoot: fx.root });
    const after = snapshotTree(fx.root);

    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.code, "unparseable-governance-doc");
    assert.match(res.message, /未写入任何文件/);
    assert.deepEqual(after, before, "坏治理文档：预览零写入");
  } finally {
    fx.cleanup();
  }
});

test("A7b N4：治理边界文档 YAML 语法错误 → unparseable-governance-doc 且零写入", async () => {
  const fx = makeS1Project();
  try {
    fs.mkdirSync(path.join(fx.root, "角色卡"), { recursive: true });
    fs.writeFileSync(path.join(fx.root, GOV_REL), "role: [未闭合\nentries: \"\n", "utf8");
    const before = snapshotTree(fx.root);
    const res = await previewGovernanceRecord({ projectRoot: fx.root });
    const after = snapshotTree(fx.root);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.code, "unparseable-governance-doc");
    assert.deepEqual(after, before);
  } finally {
    fx.cleanup();
  }
});

test("A8 无角色 → no-roles（零写入）", async () => {
  const empty = makeEmptyProject();
  try {
    const before = snapshotTree(empty.root);
    const res = await previewGovernanceRecord({ projectRoot: empty.root });
    const after = snapshotTree(empty.root);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.code, "no-roles");
    assert.match(res.message, /未写入任何文件/);
    assert.deepEqual(after, before);
  } finally {
    empty.cleanup();
  }
});

test("A9 V7：.ans 已存在 → preview 拒绝 already-established（有效）/ invalid-record（无效）且零写入", async () => {
  const valid = makeS1Project();
  const invalid = makeS1Project();
  try {
    writeUsableAns(valid.root, valid.ids);
    fs.mkdirSync(path.join(invalid.root, ".ans"), { recursive: true });
    fs.writeFileSync(path.join(invalid.root, ANS_REL), "not-json", "utf8");

    const vb = snapshotTree(valid.root);
    const vr = await previewGovernanceRecord({ projectRoot: valid.root });
    assert.equal(vr.ok, false);
    if (!vr.ok) assert.equal(vr.code, "already-established");
    assert.deepEqual(snapshotTree(valid.root), vb);

    const ib = snapshotTree(invalid.root);
    const ir = await previewGovernanceRecord({ projectRoot: invalid.root });
    assert.equal(ir.ok, false);
    if (!ir.ok) assert.equal(ir.code, "invalid-record");
    assert.deepEqual(snapshotTree(invalid.root), ib);
  } finally {
    valid.cleanup();
    invalid.cleanup();
  }
});

test("A10 桌面守卫：projectRoot 非当前导入项目 → invalid-request（不进入机制、零写入）", async () => {
  const fx = makeS1Project();
  const other = makeS1Project(["other"]);
  try {
    const { iface } = makeDesktop(fx.root);
    await iface.listProject({ projectRoot: fx.root });
    const before = snapshotTree(other.root);
    const res = await iface.previewGovernanceRecord({ projectRoot: other.root });
    const after = snapshotTree(other.root);
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.code, "invalid-request");
    assert.match(res.message, /未写入任何文件/);
    assert.deepEqual(after, before);
  } finally {
    fx.cleanup();
    other.cleanup();
  }
});

test("A11 F6 首句在拒绝回执中逐字保留且只出现一次（本套件锚点；完整 I5 断言见 c-invariants）", async () => {
  // 本文件仅作锚点校验：F6 首句常量未被本次实现改写（跨文件一致性由 c-invariants 深验）。
  assert.equal(F6_FIRST_SENTENCE, "边界未被接受或缺少证据来源（F6）：拒绝一切写入。");
});

test("A12 空项目（S0）：governanceRecord=missing 与 hasRoles=false 相互独立；动作谓词仍为 false", async () => {
  const empty = makeEmptyProject();
  try {
    const { iface } = makeDesktop(empty.root);
    const listing = await iface.listProject({ projectRoot: empty.root });
    assert.equal(listing.hasRoles, false);
    assert.equal(listing.governanceRecord.state, "missing", "无 .ans ⇒ missing（与是否有角色无关）");
    assert.equal(
      governanceActionFor(true, listing.hasRoles, listing.governanceRecord.state),
      null,
      "S0 不显示「建立治理记录」（S1 判据＝hasRoles && missing）",
    );
  } finally {
    empty.cleanup();
  }
});

test("A13 pin 不符 → pin-mismatch（不再是 present）；su 边界仍退回未接受、写入被拒", async () => {
  const fx = makeS1Project();
  try {
    writeUsableAns(fx.root, fx.ids); // pin 哈希为占位 "a"*64、治理文档不存在——结构上可用但**哈希不符**。
    const { iface } = makeDesktop(fx.root);
    const listing = await iface.listProject({ projectRoot: fx.root });
    assert.equal(
      listing.governanceRecord.state,
      "pin-mismatch",
      "2026-10-17 语义变更：pin 逐文件校验接入后，坏 pin 由 present 改判 pin-mismatch",
    );
    assert.equal(listing.governanceRecord.pinCount, 1, "pin 总条数如实返回（含一致项）");
    assert.equal(listing.governanceRecord.pinFiles?.length, 1);
    assert.equal(listing.governanceRecord.pinFiles?.[0].path, GOV_REL);
    assert.equal(listing.governanceRecord.pinFiles?.[0].actual, null, "治理文档不存在 ⇒ actual 为 null");

    // 重新接受之前：坏 pin ⇒ 边界未接受（pin-mismatch 如实暴露了此前的盲点）。
    const { project } = await effectiveOf(fx.root);
    const suBoundary = await resolveBoundarySection("su", project);
    assert.equal(suBoundary.acceptance.accepted, false, "pin 不符 ⇒ su 边界未接受");
    assert.ok((suBoundary.parseError ?? "").length > 0);
    const d = resolveWrite("docs/su/memo.md", suBoundary, undefined, {
      skillRoot: project.skillRoot,
      projectRoot: project.projectRoot,
    });
    assert.equal(d.allowed, false);
  } finally {
    fx.cleanup();
  }
});
