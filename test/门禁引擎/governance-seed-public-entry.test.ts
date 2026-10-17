// 门禁引擎测试：治理种子边界的 Service 公共出口（A1；
// PM 评审 `2026-10-17_design_existing-project-compat-review.md` §五 A1）。
//
// 背景：已有角色但无 `.ans/project.json` 的项目（S1）需要操作者显式「建立治理记录」；编排侧的
// `establishGovernanceRecord` 要拿到**治理种子边界**，但不得跨角色导入本角色私有 `common/`（§6）。
// 故 `src/service/boundary/resolve-boundary.ts` 增加公开再导出：
//   export { buildGovernanceSeedBoundaryForGate as buildGovernanceSeedBoundary }
//
// 本文件钉住：
//  1. 公开出口与私有实现是**同一函数引用**（不复制实现、不 fork 第二份种子）；
//  2. 返回形状＝三个**普通 directory**（`角色卡/`、`docs/`、`.ans/`，root 恒 project，无 condition）；
//  3. `accepted:true` 且 `source` 逐字透传（空 source 仍是调用方的事——F6 在 resolveWrite 里拒）；
//  4. 既有公开导出 `resolveBoundary` 仍在、仍可用（不改变既有导出与行为）。

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveBoundary,
  buildGovernanceSeedBoundary,
} from "../../src/service/boundary/resolve-boundary.ts";
import {
  GOVERNANCE_BOUNDARY_REL,
  buildGovernanceSeedBoundaryForGate,
} from "../../src/common/门禁引擎/governance-seed.ts";

test("公开出口 buildGovernanceSeedBoundary 与私有实现是同一函数引用（不复制实现）", () => {
  assert.equal(
    buildGovernanceSeedBoundary,
    buildGovernanceSeedBoundaryForGate,
    "Service 公共出口必须是同一函数引用（而非包装/副本）",
  );
});

test("种子边界：返回三目录普通 directory（角色卡/、docs/、.ans/），root 恒 project、无 condition", () => {
  const b = buildGovernanceSeedBoundary("test:seed-public-entry");
  assert.equal(b.entries.length, 3, "种子条目恰为三处治理产物（有界，不含 src/ 与任意文件）");
  assert.deepEqual(
    b.entries.map((e) => e.path),
    ["角色卡/", "docs/", ".ans/"],
    "条目路径与顺序固定",
  );
  for (const e of b.entries) {
    assert.equal(e.kind, "directory", `条目 ${e.path} 必须是普通 directory（非条件目录）`);
    assert.equal(e.root, "project", `条目 ${e.path} 的 root 恒为 project`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(e, "condition"),
      false,
      `条目 ${e.path} 不得带 condition（普通目录无需 slug）`,
    );
  }
  assert.equal(b.boundarySource, GOVERNANCE_BOUNDARY_REL, "boundarySource＝治理边界文档的项目相对路径");
  assert.equal(b.parseError, undefined, "种子边界不是解析产物、无 parseError");
});

test("种子边界：accepted:true 且 source 逐字透传（含空 source）", () => {
  const src = "desktop-app:操作者为已有角色的项目显式建立治理记录";
  const b = buildGovernanceSeedBoundary(src);
  assert.equal(b.acceptance.accepted, true);
  assert.equal(b.acceptance.source, src, "source 须逐字透传（操作者动作来源，用于 .ans 留痕）");
  assert.equal(b.acceptance.pin, undefined, "一次性种子边界不带 pin（pin 只在 finalize 落盘后由代码计算）");

  const empty = buildGovernanceSeedBoundary("");
  assert.equal(empty.acceptance.accepted, true);
  assert.equal(empty.acceptance.source, "", "空 source 原样透传——是否放行由 resolveWrite 的 F6 判定");
});

test("每次调用返回全新对象/数组（一次性边界，无共享可变状态）", () => {
  const a = buildGovernanceSeedBoundary("test:a");
  const b = buildGovernanceSeedBoundary("test:a");
  assert.notEqual(a, b);
  assert.notEqual(a.entries, b.entries, "条目数组不得跨调用共享");
  a.entries.push({ root: "project", path: "src/", kind: "directory", purpose: "mutated" });
  assert.equal(b.entries.length, 3, "改动一次调用的结果不得影响下一次调用");
});

test("既有公开导出 resolveBoundary 未受影响（仍为函数）", () => {
  assert.equal(typeof resolveBoundary, "function");
});
