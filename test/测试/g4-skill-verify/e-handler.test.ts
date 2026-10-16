// test/测试/g4-skill-verify/e-handler.test.ts —— G-4 独立验证 E 域：**桌面 handler（I3）**。
//
// 对抗性独立构造（自建 SessionManager 夹具，真实临时项目盘）：
// ① 裁定④轮次护栏对抗矩阵（无轮次/直聊/排队客户消息/回交轮/系统轮/派发轮[私有面直注]）；
// ② 拒绝全分支 → reason 映射 + 零副作用（树快照/重建计数/系统行三重核对）；
// ③ 激活三态（rebuilt / next-session[在跑|无会话] / rebuild-failed 如实）；
// ④ [系统·安装] 经第四类通道真投递且不可撤回；⑤ 诊断事件（skill.installed/skill.refused）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { makeG4Harness, openSuAndStartTurn, writeSkill, snapshotTree, until, flush } from "./fixture.ts";
import type { G4Harness } from "./fixture.ts";
import type { TaskHandback } from "../../../src/common/编排/handback.ts";
import { configureDiagnostics, disposeDiagnostics, flushDiagnostics } from "../../../src/common/shared/diagnostics.ts";

const suTarget = (h: G4Harness) => ({ projectRoot: h.root, roleId: "su", runtime: "demo" as const });

async function openRole(h: G4Harness, roleId: string): Promise<void> {
  const opened = await h.mgr.open({ projectRoot: h.root, roleId, runtime: "demo" });
  assert.equal(opened.ok, true, `开启 ${roleId} 会话应成功`);
}

// —————————————————————— ① 轮次护栏对抗矩阵 ——————————————————————

test("护栏矩阵：无轮次/回交轮/系统轮/派发轮 ⇒ not-customer-turn（零副作用）；直聊与排队客户消息轮 ⇒ 放行", async () => {
  {
    // (a) 无轮次：su 开着但空闲
    const h = await makeG4Harness();
    try {
      writeSkill(h.root, "k1", { roles: "X" });
      await openRole(h, "X");
      await openRole(h, "su");
      const before = snapshotTree(h.root);
      const r = await h.suInstall()!({ roleId: "X", name: "k1" });
      assert.equal(r.ok, false);
      assert.equal((r as { reason: string }).reason, "not-customer-turn", "无轮次 ⇒ 护栏拒绝");
      assert.equal((r as { message: string }).message, "本动作仅可在客户消息发起的轮次执行——未执行。", "文案逐字");
      assert.deepEqual(snapshotTree(h.root), before, "零副作用（盘快照一致）");
      assert.equal(h.disposed("X"), 0, "零重建");
    } finally {
      h.cleanup();
    }
  }
  {
    // (b) 回交轮：X 推 handback 事件 ⇒ su 被回交投递开轮（kind handback）
    const h = await makeG4Harness();
    try {
      writeSkill(h.root, "k1", { roles: "X" });
      await openRole(h, "X");
      await openRole(h, "su");
      const hb: TaskHandback = { roleId: "X", taskId: "T1", status: "completed", summary: "做完了", evidence: [], at: "2026-10-16T00:00:00.000Z" };
      h.ctl("X").streams.push({ kind: "handback", summary: "回交 su", handback: hb } as never);
      h.ctl("X").wake?.();
      await until(() => h.ctl("su").sent.length > 0);
      const r = await h.suInstall()!({ roleId: "X", name: "k1" });
      assert.equal(r.ok, false);
      assert.equal((r as { reason: string }).reason, "not-customer-turn", "回交轮 ⇒ 护栏拒绝");
      assert.equal(h.disposed("X"), 0);
    } finally {
      h.cleanup();
    }
  }
  {
    // (c) 系统轮：watchdogDeliver 直接给空闲 su 开轮（kind system）
    const h = await makeG4Harness();
    try {
      writeSkill(h.root, "k1", { roles: "X" });
      await openRole(h, "su");
      h.mgr.watchdogDeliver(h.root, { text: "[系统·看护] 验证告警", summary: "系统·看护 · 验证", dedupKey: `watchdog\0${h.root}\0verify-guard` });
      await until(() => h.ctl("su").sent.length > 0);
      const r = await h.suInstall()!({ roleId: "X", name: "k1" });
      assert.equal(r.ok, false);
      assert.equal((r as { reason: string }).reason, "not-customer-turn", "系统轮 ⇒ 护栏拒绝");
    } finally {
      h.cleanup();
    }
  }
  {
    // (d) 派发轮：su 在真实装配下不可能是派发目标（routeDispatch 拒内置角色）——对抗构造直注私有面
    //     （activeDeliveries.kind="dispatch" + busy），检验**判据代码本身**（active.kind === "message"）。
    const h = await makeG4Harness();
    try {
      writeSkill(h.root, "k1", { roles: "X" });
      await openRole(h, "su");
      const mgr = h.mgr as unknown as { sessions: Map<string, { busy: boolean }>; activeDeliveries: Map<string, { kind: string }> };
      const key = `${h.root}\u0000su\u0000demo`;
      mgr.sessions.get(key)!.busy = true;
      mgr.activeDeliveries.set(key, { kind: "dispatch" });
      const r = await h.suInstall()!({ roleId: "X", name: "k1" });
      assert.equal(r.ok, false);
      assert.equal((r as { reason: string }).reason, "not-customer-turn", "dispatch 类投递开的轮 ⇒ 护栏拒绝");
    } finally {
      h.cleanup();
    }
  }
  {
    // (e) 直聊轮（activeDeliveries 无条目）⇒ 护栏放行（走到校验层——以完整成功实证）
    const h = await makeG4Harness();
    try {
      writeSkill(h.root, "k1", { roles: "X" });
      await openRole(h, "X");
      await openSuAndStartTurn(h);
      const r = await h.suInstall()!({ roleId: "X", name: "k1" });
      assert.equal(r.ok, true, "客户直聊轮 ⇒ 放行到成功");
    } finally {
      h.cleanup();
    }
  }
  {
    // (f) 排队客户消息轮（kind message）⇒ 放行：su 忙时第二条客户消息入队，settle 后由队列开出新轮
    const h = await makeG4Harness();
    try {
      writeSkill(h.root, "k1", { roles: "X" });
      await openRole(h, "X");
      await openSuAndStartTurn(h);
      const queued = await h.mgr.send("第二条客户消息", undefined, suTarget(h));
      assert.equal(queued.ok, true);
      await h.settle("su"); // 首轮结束 → 队列开出 message 类新轮
      await until(() => h.ctl("su").sent.length >= 2);
      const r = await h.suInstall()!({ roleId: "X", name: "k1" });
      assert.equal(r.ok, true, "排队客户消息开的轮 ⇒ 放行（active.kind==='message'）");
    } finally {
      h.cleanup();
    }
  }
});

// —————————————————————— ② 拒绝分支 → reason 映射＋零副作用 ——————————————————————

test("拒绝分支矩阵：role-not-found / not-registered / role-not-listed / registration-unchanged——回执如实、零副作用", async () => {
  const h = await makeG4Harness();
  try {
    writeSkill(h.root, "k1", { roles: "X" });
    writeSkill(h.root, "for-y", { roles: "Y" });
    writeSkill(h.root, "no-content", { roles: "X", noSkillFile: true });
    await openRole(h, "X");
    await openSuAndStartTurn(h);
    const install = h.suInstall()!;
    const uninstall = h.suUninstall()!;

    const expectRefusal = async (p: Promise<unknown>, reason: string, msgPart: string, label: string): Promise<void> => {
      const before = snapshotTree(h.root);
      const r = (await p) as { ok: boolean; reason: string; message: string };
      assert.equal(r.ok, false, `${label}: ok=false`);
      assert.equal(r.reason, reason, `${label}: reason`);
      assert.ok(r.message.includes(msgPart), `${label}: message 含「${msgPart}」（原文：${r.message}）`);
      assert.deepEqual(snapshotTree(h.root), before, `${label}: 零副作用（盘快照一致）`);
      assert.equal(h.disposed("X"), 0, `${label}: 零重建`);
    };

    await expectRefusal(install({ roleId: "NOPE", name: "k1" }), "role-not-found", "角色「NOPE」不是本项目项目角色（或为治理角色 su）——未执行。", "角色不存在");
    await expectRefusal(install({ roleId: "su", name: "k1" }), "role-not-found", "或为治理角色 su", "su 自身");
    await expectRefusal(install({ roleId: "  ", name: "k1" }), "role-not-found", "——未执行。", "空 roleId");
    await expectRefusal(install({ roleId: "X", name: "不存在" }), "not-registered", "技能未登记：docs/skills/不存在/install.md 不存在——先落盘再安装；未执行。", "登记缺失");
    await expectRefusal(install({ roleId: "X", name: "for-y" }), "role-not-listed", "登记中未包含角色「X」——未执行；如确要安装请先更新登记。", "登记未含角色");
    await expectRefusal(install({ roleId: "X", name: "no-content" }), "not-registered", "技能内容缺失：docs/skills/no-content/SKILL.md 不存在或不可读——先落盘再安装；未执行。", "内容件缺失");
    await expectRefusal(uninstall({ roleId: "X", name: "k1" }), "registration-unchanged", "登记仍含角色「X」——先改登记再卸载；未执行。", "卸载前登记未改");
    await expectRefusal(uninstall({ roleId: "X", name: "不存在" }), "not-registered", "不存在或不可解析——没有可撤销的登记；未执行。", "卸载登记缺失");

    // 状态未生效（uninstalled）⇒ 安装拒绝 not-registered（「先改登记再安装」）；
    writeSkill(h.root, "off", { roles: "X", status: "uninstalled" });
    await expectRefusal(install({ roleId: "X", name: "off" }), "not-registered", "状态为「uninstalled」——先改登记再安装；未执行。", "停用态安装");

    // 全程无系统行（envelopes 零新增且 su 无新投递）。
    assert.equal(h.envelopes.filter((e) => /系统·安装/.test(e.event.summary)).length, 0, "拒绝路径不得投系统行");
  } finally {
    h.cleanup();
  }
});

// —————————————————————— ③ 激活三态＋④ 系统行＋⑤ 诊断 ——————————————————————

test("成功路径（rebuilt）：回执冻形逐字段/digest 独立复算；X 会话已重建；[系统·安装] 真投递且不可撤回", async () => {
  const diagDir = fs.mkdtempSync(path.join(os.tmpdir(), "g4-handler-diag-"));
  const h = await makeG4Harness();
  try {
    configureDiagnostics({ directory: diagDir });
    const digest = writeSkill(h.root, "k1", { roles: "X", purpose: "装载顺序校验", content: "K1 内容\n" });
    await openRole(h, "X");
    await openSuAndStartTurn(h);

    const r = (await h.suInstall()!({ roleId: "X", name: "k1" })) as {
      ok: boolean; action: string; roleId: string; name: string; path: string; digest: string; effective: string; note?: string;
    };
    assert.equal(r.ok, true);
    assert.equal(r.action, "installed");
    assert.equal(r.roleId, "X");
    assert.equal(r.name, "k1");
    assert.equal(r.path, "docs/skills/k1/SKILL.md", "path＝技能文件路径");
    assert.equal(r.digest, digest, "digest＝SKILL.md 当刻字节 sha256（独立复算一致）");
    assert.equal(r.effective, "rebuilt", "idle 目标 ⇒ 当场重建");
    assert.equal(r.note, undefined, "rebuilt 无 note");
    assert.equal(h.disposed("X"), 1, "X 旧会话已 dispose");
    assert.equal(h.openedCount("X"), 2, "X 会话重开（新会话即刻含注入节）");

    // [系统·安装] 系统行：忙时排队（su 正处客户轮）——队列条目 kind=system、id 属 watchdog 命名空间。
    const suState = h.roleStates.filter((s) => s.roleId === "su").at(-1);
    const row = suState?.queue.find((q) => q.summary.startsWith("系统·安装"));
    assert.ok(row, "安装完成 ⇒ 系统行经第四类通道入队");
    assert.equal(row!.kind, "system", "系统行 kind=system（不可撤回面）");
    assert.ok(row!.id.startsWith(`watchdog\u0000${h.root}\u0000install-row\u0000`), "去重键属 watchdog 命名空间且逐事件独立");
    assert.ok(row!.full.startsWith("[系统·安装] 已安装技能「k1」→ 角色「X」"), "正文文首＝[系统·安装] 定格标记；原文：" + row!.full);
    assert.ok(row!.full.includes("已重建该角色会话、即刻生效") && row!.full.includes(`sha256 ${digest.slice(0, 12)}`), "系统行含生效态与短 digest");

    // 不可撤回（排队期间同样不可撤）。
    const withdraw = h.mgr.withdraw(suTarget(h), row!.id);
    assert.equal(withdraw.ok, false, "系统行不可撤回");
    assert.ok(withdraw.error?.includes("不可撤回"), `撤回回执如实：${withdraw.error}`);

    // su 轮次结束 ⇒ 系统行真投递给 su（新轮开启）。
    await h.settle("su");
    await until(() => h.ctl("su").sent.some((t) => t.startsWith("[系统·安装]")));
    assert.ok(h.ctl("su").sent.some((t) => t.startsWith("[系统·安装] 已安装技能「k1」")), "系统行真投递（不可静默丢）");

    // 诊断落盘：skill.installed 事件在场。
    await flushDiagnostics();
    const files = fs.readdirSync(diagDir).filter((f) => f.startsWith("ans-diagnostics-"));
    const rows = files.flatMap((f) => fs.readFileSync(path.join(diagDir, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>));
    const ev = rows.find((rowv) => rowv["event"] === "skill.installed");
    assert.ok(ev, "诊断含 skill.installed");
    assert.equal(ev!["toolName"], "install_skill");
    assert.equal(ev!["targetRoleId"], "X");
    assert.equal(ev!["path"], "docs/skills/k1/SKILL.md");
    assert.equal(ev!["state"], "rebuilt");
  } finally {
    await disposeDiagnostics();
    h.cleanup();
    fs.rmSync(diagDir, { recursive: true, force: true });
  }
});

test("成功路径（next-session 两支）：在跑不打断（无 note）；无会话（note 如实、不自动开）", async () => {
  {
    const h = await makeG4Harness();
    try {
      writeSkill(h.root, "k1", { roles: "X" });
      await openRole(h, "X");
      await h.mgr.send("X 先忙", undefined, { projectRoot: h.root, roleId: "X", runtime: "demo" }); // X busy
      await openSuAndStartTurn(h);
      const r = (await h.suInstall()!({ roleId: "X", name: "k1" })) as { ok: boolean; effective: string; note?: string };
      assert.equal(r.ok, true);
      assert.equal(r.effective, "next-session", "在跑 ⇒ 如实延迟（不是错误）");
      assert.equal(r.note, undefined, "在跑支不附无会话 note");
      assert.equal(h.disposed("X"), 0, "在跑不打断（零 dispose）");
    } finally {
      h.cleanup();
    }
  }
  {
    const h = await makeG4Harness();
    try {
      writeSkill(h.root, "k1", { roles: "X" });
      await openSuAndStartTurn(h); // X 未开
      const r = (await h.suInstall()!({ roleId: "X", name: "k1" })) as { ok: boolean; effective: string; note?: string };
      assert.equal(r.ok, true);
      assert.equal(r.effective, "next-session", "无会话 ⇒ next-session（新会话打开即生效）");
      assert.ok(r.note?.includes("该角色当前没有打开的会话"), `note 如实：${r.note}`);
      assert.equal(h.openedCount("X"), 0, "不自动开目标会话（零副作用）");
    } finally {
      h.cleanup();
    }
  }
});

test("rebuild-failed 如实：重开失败 ⇒ ok:false/reason=rebuild-failed/不假装已生效；不投系统行", async () => {
  const h = await makeG4Harness();
  try {
    writeSkill(h.root, "k1", { roles: "X" });
    await openRole(h, "X");
    await openSuAndStartTurn(h);
    h.failOpensAfter["X"] = 1; // 第 2 次 open（重建重开）失败
    const envBefore = h.envelopes.length;
    const r = (await h.suInstall()!({ roleId: "X", name: "k1" })) as { ok: boolean; reason: string; message: string };
    assert.equal(r.ok, false);
    assert.equal(r.reason, "rebuild-failed");
    assert.ok(r.message.includes("未假装已生效"), `如实文案：${r.message}`);
    assert.ok(r.message.includes("登记仍在"), "登记仍在如实");
    assert.equal(h.roleStates.some((s) => s.roleId === "su" && s.queue.some((q) => q.summary.startsWith("系统·安装"))), false, "失败路径不投系统行");
    assert.ok(h.envelopes.length >= envBefore, "事件不减少（rebuild.start 等放行性事件可继续）");
  } finally {
    h.cleanup();
  }
});

// —————————————————————— 卸载成功路径 ——————————————————————

test("卸载成功路径：先改登记（移除角色）再 uninstall ⇒ ok:true/uninstalled；系统行「效果已撤，文件保留」二分", async () => {
  const h = await makeG4Harness();
  try {
    writeSkill(h.root, "k1", { roles: "X" });
    await openRole(h, "X");
    const openedX = h.openedCount("X");
    await openSuAndStartTurn(h);
    // 先改登记：从适用角色移除 X（模拟 su edit_file）。
    fs.writeFileSync(
      path.join(h.root, "docs", "skills", "k1", "install.md"),
      ["# 安装登记：k1", "", "- 用途：p", "- 适用角色：Y", "- 状态：installed", "- 安装日期：2026-10-16", ""].join("\n"),
    );
    const r = (await h.suUninstall()!({ roleId: "X", name: "k1" })) as { ok: boolean; action: string; effective: string };
    assert.equal(r.ok, true);
    assert.equal(r.action, "uninstalled");
    assert.equal(r.effective, "rebuilt", "idle 目标重建 ⇒ 即刻生效");
    assert.equal(h.openedCount("X"), openedX + 1, "X 已按新登记重建");
    // 登记文件与 SKILL.md 本体均未被工具删除（文件保留）。
    assert.equal(fs.existsSync(path.join(h.root, "docs", "skills", "k1", "SKILL.md")), true, "SKILL.md 文件保留（无删除原语）");
    assert.equal(fs.existsSync(path.join(h.root, "docs", "skills", "k1", "install.md")), true, "登记文件保留");
    const row = h.roleStates.filter((s) => s.roleId === "su").at(-1)?.queue.find((q) => q.summary.startsWith("系统·安装"));
    assert.ok(row?.full.includes("效果已撤，文件保留于 docs/skills/k1/SKILL.md"), `卸载系统行二分陈述：${row?.full}`);
    await flush(60);
  } finally {
    h.cleanup();
  }
});
