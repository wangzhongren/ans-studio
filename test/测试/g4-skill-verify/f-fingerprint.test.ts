// test/测试/g4-skill-verify/f-fingerprint.test.ts —— G-4 独立验证 F 域：**裁定⑤ O-1 指纹扩展**。
//
// 对抗性独立构造（自建 SessionManager 夹具，真实盘）：
// ① 三触发：新增（新技能落盘/登记改列本角色）／内容编辑（SKILL.md 字节变化）／移除（登记撤本角色）⇒ 陈旧重建；
// ② 零技能负例：无任何技能 ⇒ 既有指纹语义逐字不变（零重建）；
// ③ 坏登记不误重建：解析失败/未知状态 ⇒ currentSkillPaths 跳过 ⇒ 零重建；
// ④ SKILL.md 缺失收敛：登记在而内容缺 ⇒ 不触发；补齐内容 ⇒ 触发（补好即收敛到注入）；
// ⑤ 别角色的技能变化不误伤本角色。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { makeG4Harness, writeSkill } from "./fixture.ts";
import type { G4Harness } from "./fixture.ts";

async function openRole(h: G4Harness, roleId: string): Promise<void> {
  const opened = await h.mgr.open({ projectRoot: h.root, roleId, runtime: "demo" });
  assert.equal(opened.ok, true, `开启 ${roleId} 会话应成功`);
}

const skillEnvelope = (h: G4Harness) =>
  h.envelopes.filter((e) => e.roleId === "X" && /已安装技能已变更/.test(e.event.summary)).at(-1)?.event.summary;

test("① 三触发：新增 / 内容编辑 / 移除——逐触发重建并如实点名（skill 措辞与边界措辞分开）", async () => {
  const h = await makeG4Harness();
  try {
    await openRole(h, "X");
    assert.equal(h.disposed("X"), 0);

    // 新增：技能落盘（登记列 X）⇒ 陈旧。
    const digest1 = writeSkill(h.root, "k1", { roles: "X", content: "v1\n" });
    assert.deepEqual(await h.mgr.refreshStaleBoundaries(), ["X"], "新增技能 ⇒ X 陈旧重建");
    assert.equal(h.disposed("X"), 1);
    // 平台真值（v1.3.0 CI Windows 红修复）：产品按 `changed` 原样点名（Windows 为反斜杠原生分隔符）——
    // 桌面窗口属主测试同口径（boundary-refresh 用 path.join 冻结）。此处期望值＝平台原生形，断言本体不变。
    assert.ok(skillEnvelope(h)?.includes(path.join("docs", "skills", "k1", "SKILL.md")), `如实点名变化文件：${skillEnvelope(h)}`);
    assert.ok(skillEnvelope(h)?.includes("已作废旧会话，按新技能登记重开"), "措辞＝技能面（不是边界面）");

    // 内容编辑：SKILL.md 字节变化 ⇒ 再触发（此时 X 新会话冻结了旧 digest）。
    fs.writeFileSync(path.join(h.root, "docs", "skills", "k1", "SKILL.md"), "v2-改长了\n");
    assert.deepEqual(await h.mgr.refreshStaleBoundaries(), ["X"], "内容编辑 ⇒ 陈旧重建");
    assert.equal(h.disposed("X"), 2);
    assert.notEqual(digest1, "v2-改长了\n");

    // 空闲无变化 ⇒ 不重建（负例：不空转）。
    assert.deepEqual(await h.mgr.refreshStaleBoundaries(), [], "无变化 ⇒ 零重建");

    // 移除：登记不再列 X ⇒ 集合差触发。
    writeSkill(h.root, "k1", { roles: "Y", content: "v2-改长了\n" });
    assert.deepEqual(await h.mgr.refreshStaleBoundaries(), ["X"], "登记移除本角色 ⇒ 陈旧重建");
    assert.equal(h.disposed("X"), 3);
  } finally {
    h.cleanup();
  }
});

test("② 零技能负例：从未装过技能 ⇒ 既有指纹语义逐字不变（零重建、零 skill 事件）", async () => {
  const h = await makeG4Harness();
  try {
    await openRole(h, "X");
    await openRole(h, "Y");
    assert.deepEqual(await h.mgr.refreshStaleBoundaries(), [], "零技能 ⇒ 零陈旧");
    assert.equal(h.disposed("X"), 0);
    assert.equal(h.disposed("Y"), 0);
    assert.equal(h.envelopes.filter((e) => /已安装技能已变更/.test(e.event.summary)).length, 0);
  } finally {
    h.cleanup();
  }
});

test("③ 坏登记不误重建：解析失败/未知状态/缺件目录 ⇒ currentSkillPaths 跳过（零重建）", async () => {
  const h = await makeG4Harness();
  try {
    // 先落坏件（X 开会话时它们就该被跳过）。
    fs.mkdirSync(path.join(h.root, "docs", "skills", "bad-parse"), { recursive: true });
    fs.writeFileSync(path.join(h.root, "docs", "skills", "bad-parse", "install.md"), "# 只有标题，无字段\n");
    writeSkill(h.root, "bad-status", { roles: "X", status: "paused" });
    fs.mkdirSync(path.join(h.root, "docs", "skills", "empty-dir"), { recursive: true });
    await openRole(h, "X");
    assert.deepEqual(await h.mgr.refreshStaleBoundaries(), [], "坏登记不算变化（冻结集与当刻集同空）");
    assert.equal(h.disposed("X"), 0, "零重建（绝不据坏件误判）");
    // 稳定性复跑（第二次检查仍零重建）。
    assert.deepEqual(await h.mgr.refreshStaleBoundaries(), []);
  } finally {
    h.cleanup();
  }
});

test("④ SKILL.md 缺失收敛：登记在而内容缺 ⇒ 不触发；补齐 ⇒ 触发（与渲染器「补好即注入」收敛一致）", async () => {
  const h = await makeG4Harness();
  try {
    writeSkill(h.root, "k1", { roles: "X", noSkillFile: true });
    await openRole(h, "X"); // 开会话时：登记命中、内容缺 → 路径入冻结集（指纹 <missing>）
    assert.deepEqual(await h.mgr.refreshStaleBoundaries(), [], "内容仍缺 ⇒ 无集合差（<missing> 稳定）");
    assert.equal(h.disposed("X"), 0);
    fs.writeFileSync(path.join(h.root, "docs", "skills", "k1", "SKILL.md"), "补好\n");
    assert.deepEqual(await h.mgr.refreshStaleBoundaries(), ["X"], "补齐内容 ⇒ 触发重建（新会话注入收敛）");
    assert.equal(h.disposed("X"), 1);
  } finally {
    h.cleanup();
  }
});

test("⑤ 隔离：别角色（Y）的技能变化不误伤 X；Y 未开会话 ⇒ 行级重建只发生在受影响角色", async () => {
  const h = await makeG4Harness();
  try {
    writeSkill(h.root, "for-y", { roles: "Y" });
    await openRole(h, "X"); // X 冻结集为空（技能不属于 X）
    await openRole(h, "Y"); // Y 冻结集含该技能
    assert.deepEqual(await h.mgr.refreshStaleBoundaries(), [], "各自冻结与当刻一致 ⇒ 零重建");
    // Y 的技能内容编辑 ⇒ 只 Y 重建。
    fs.writeFileSync(path.join(h.root, "docs", "skills", "for-y", "SKILL.md"), "变长内容\n");
    assert.deepEqual(await h.mgr.refreshStaleBoundaries(), ["Y"], "只有 Y 受影响");
    assert.equal(h.disposed("Y"), 1);
    assert.equal(h.disposed("X"), 0, "X 不受别角色技能影响");
  } finally {
    h.cleanup();
  }
});
