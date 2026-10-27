// test/桌面UI/role-view.test.ts
// Phase 5A 迁移：旧 W4/W6-C 左树/治理角色文案与分组中的纯展示映射。
// 新实现 = app/renderer/src/chat/role-view.ts（按 governanceFunction 派生，不硬编码角色 id）。

import test from "node:test";
import assert from "node:assert/strict";
import {
  findRole,
  flattenRoles,
  governanceView,
  groupRoles,
  roleDisplayName,
  roleSubtitle,
} from "../../app/renderer/src/chat/role-view.ts";
import type { RoleView } from "../../app/renderer/src/chat/types.ts";

const role = (extra: Partial<RoleView> & { roleId: string }): RoleView =>
  ({ cardText: "", boundary: { entries: [] }, ...extra }) as RoleView;

test("W4/W6-C：五角色纯中文名/权力副标题/内置标识按 governanceFunction 派生", () => {
  const cases: Array<[string, string, string]> = [
    ["liaison", "产品", "客户沟通 · 不拥有最终批准权"],
    ["proposal", "策划", "提案权 · 不拥有最终批准权"],
    ["nomination", "人事", "写卡权（客户任命后） · 不拥有最终批准权"],
    ["schedule", "运营", "排期权 · 不拥有最终批准权"],
    ["verification", "质检", "验收权 · 不拥有最终批准权"],
  ];
  for (const [fn, name, power] of cases) {
    const view = governanceView(fn);
    assert.equal(view?.name, name);
    assert.equal(view?.power, power);
    assert.equal(view?.builtinNote, "内置角色：随应用发布，无角色目录");
    const item = role({ roleId: "whatever-" + fn, governanceFunction: fn, builtIn: true });
    assert.equal(roleDisplayName(item), name);
    assert.equal(roleSubtitle(item), power);
  }
  // 未知治理职能不猜、不冒充内置。
  assert.equal(governanceView("unknown"), null);
  assert.equal(governanceView(undefined), null);
  assert.equal(roleDisplayName(role({ roleId: "worker", governanceFunction: "unknown" })), "worker");
});

test("W6-C：普通角色显示 roleId，内置角色副标题说明 SKILL.md；未选择为未选择角色", () => {
  assert.equal(roleDisplayName(null), "未选择角色");
  assert.equal(roleDisplayName(undefined), "未选择角色");
  assert.equal(roleDisplayName(role({ roleId: "worker" })), "worker");
  assert.equal(roleSubtitle(role({ roleId: "builtin", builtIn: true })), "内置治理角色（定义见 SKILL.md）");
  assert.equal(roleSubtitle(null), "");
});

test("角色卡首句：去标题、按换行/句号/分号取首句；超 42 字省略；空则边界条目数", () => {
  assert.equal(roleSubtitle(role({ roleId: "a", cardText: "# 研发\n负责实现。" })), "研发");
  assert.equal(roleSubtitle(role({ roleId: "b", cardText: "第一句；第二句" })), "第一句");
  const long = "角".repeat(50);
  assert.equal(roleSubtitle(role({ roleId: "c", cardText: long })), "角".repeat(42) + "…");
  assert.equal(
    roleSubtitle(role({ roleId: "d", cardText: "", boundary: { entries: [{}, {}] } as never })),
    "2 条边界条目",
  );
});

test("W4：左树三组——主入口/治理职能（内置）/工作角色；治理组排除主入口", () => {
  const roles = [
    role({ roleId: "liaison", governanceFunction: "liaison", builtIn: true, group: "治理职能（内置）" }),
    role({ roleId: "proposal", governanceFunction: "proposal", builtIn: true }),
    role({ roleId: "worker", group: "平台组" }),
    role({ roleId: "solo" }),
  ];
  const groups = groupRoles(roles, "liaison");
  assert.deepEqual(groups.map((group) => group.label), [
    "主入口",
    "治理职能（内置）",
    "平台组",
    "工作角色",
  ]);
  assert.deepEqual(groups[0].roles.map((item) => item.roleId), ["liaison"]);
  assert.deepEqual(groups[1].roles.map((item) => item.roleId), ["proposal"]);
  assert.deepEqual(flattenRoles(groups).map((item) => item.roleId), [
    "liaison",
    "proposal",
    "worker",
    "solo",
  ]);
  assert.equal(findRole(roles, "worker")?.roleId, "worker");
  assert.equal(findRole(roles, null), null);
  assert.equal(findRole(roles, "missing"), null);
});

test("主入口由 primaryRoleId 驱动（不硬编码 liaison）；无主入口时省略该组", () => {
  const roles = [
    role({ roleId: "lead-x", group: "平台组" }),
    role({ roleId: "worker" }),
  ];
  const groups = groupRoles(roles, "lead-x");
  assert.equal(groups[0].label, "主入口");
  assert.equal(groups[0].roles[0].roleId, "lead-x");
  assert.deepEqual(groupRoles(roles, null).map((group) => group.label), ["平台组", "工作角色"]);
});

test("组名去空白；职责原文保留；缺组不推权限（只按列出字段）", () => {
  const item = role({ roleId: "w", group: "  项目组  ", groupDuty: "组员" });
  const groups = groupRoles([item], null);
  assert.equal(groups[0].label, "项目组");
  assert.equal(groups[0].roles[0].groupDuty, "组员");
  assert.equal(flattenRoles([]).length, 0);
});
