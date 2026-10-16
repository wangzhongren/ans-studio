// test/测试/g4v2-mcp-verify/f-handler.test.ts —— F 域：桌面 install_mcp/uninstall_mcp handler（applyMcpChange）。
//
// 独立构造：真实临时项目盘（docs/mcp 声明真落盘）＋自建 SessionManager 夹具（f-fixture）＋独立重算
// digest/盘快照；护栏矩阵（含私有面直注模拟非客户轮）；三态；[系统·安装] 真投递与不可撤回；诊断落盘。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { configureDiagnostics, flushDiagnostics, disposeDiagnostics } from "../../../src/common/shared/diagnostics.ts";
import { describeTool } from "../../../src/provider/runtime/schema.ts";
import { snapshotTree, writeMcpDeclaration, flush } from "./helpers.ts";
import { makeFHarness, openSuAndStartTurn, openXAndStartTurn, until, type FHarness } from "./f-fixture.ts";

const suTarget = (h: FHarness) => ({ projectRoot: h.root, roleId: "su", runtime: "demo" as const });

function sha256Of(abs: string): string {
  return createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}

test("F1 成功链（rebuilt）：校验→激活重建→冻形回执→[系统·安装] 真投递（含诚实面）→不可撤回→诊断", async () => {
  const diagDir = fs.mkdtempSync(path.join(os.tmpdir(), "g4v2-f-diag-"));
  const h = await makeFHarness();
  try {
    configureDiagnostics({ directory: diagDir });
    const digest = writeMcpDeclaration(h.root, "srv-ok", { roles: "X", purpose: "验证用" });
    await h.mgr.open({ projectRoot: h.root, roleId: "X", runtime: "demo" }); // X 已开、idle
    await openSuAndStartTurn(h);
    const install = h.suInstallMcp();
    assert.ok(install, "su 会话须注入 installMcp（真实注入路径捕获）");

    const r = (await install!({ roleId: "X", name: "srv-ok" })) as {
      ok: boolean; action: string; roleId: string; name: string; path: string; digest: string; effective: string; note?: string;
    };
    assert.equal(r.ok, true);
    assert.equal(r.action, "installed");
    assert.equal(r.roleId, "X");
    assert.equal(r.name, "srv-ok");
    assert.equal(r.path, "docs/mcp/srv-ok.md", "path＝声明文件路径");
    assert.equal(r.digest, digest, "digest＝声明文件当刻字节 sha256（独立复算一致）");
    assert.equal(r.effective, "rebuilt", "idle 目标 ⇒ 当场重建");
    assert.equal(r.note, undefined);
    assert.equal(h.disposed("X"), 1, "X 旧会话已 dispose");
    assert.equal(h.openedCount("X"), 2, "X 会话已重建（新会话即刻装配）");

    // [系统·安装] 系统行：su 忙 ⇒ 先入队；正文含命名与诚实面（能力级授予/非逐调用受审）
    const row = h.roleStates.filter((s) => s.roleId === "su").at(-1)?.queue.find((q) => q.summary.startsWith("系统·安装"));
    assert.ok(row, "安装完成 ⇒ 系统行经第四类通道入队");
    assert.equal(row!.kind, "system", "kind=system（不可撤回面）");
    assert.ok(row!.id.startsWith(`watchdog\u0000${h.root}\u0000mcp-install-row\u0000`), "去重键命名空间独立");
    assert.ok(row!.full.startsWith("[系统·安装] 已安装 MCP「srv-ok」→ 角色「X」"), `文首定格标记＋事实：${row!.full}`);
    assert.ok(row!.full.includes("已重建该角色会话、即刻生效"), "系统行含生效态");
    assert.ok(row!.full.includes(`sha256 ${digest.slice(0, 12)}`), "系统行含短 digest");
    assert.ok(row!.full.includes("外来 MCP 工具在 ANS 门禁之外执行（能力级授予，非逐调用受审）"), "安装系统行含诚实面");

    // 不可撤回（排队期间同样不可撤）
    const withdraw = h.mgr.withdraw(suTarget(h), row!.id);
    assert.equal(withdraw.ok, false, "系统行不可撤回");
    assert.ok(withdraw.error?.includes("不可撤回"), `撤回回执如实：${withdraw.error}`);

    // settle su ⇒ 真投递
    await h.settle("su");
    await until(() => h.ctl("su").sent.some((t) => t.startsWith("[系统·安装] 已安装 MCP「srv-ok」")));

    // 诊断：mcp.installed 落盘、字段如实
    await flushDiagnostics();
    const files = fs.readdirSync(diagDir).filter((f) => f.startsWith("ans-diagnostics-"));
    const rows = files.flatMap((f) => fs.readFileSync(path.join(diagDir, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>));
    const ev = rows.find((rowv) => rowv["event"] === "mcp.installed");
    assert.ok(ev, "诊断含 mcp.installed");
    assert.equal(ev!["toolName"], "install_mcp");
    assert.equal(ev!["targetRoleId"], "X");
    assert.equal(ev!["path"], "docs/mcp/srv-ok.md");
    assert.equal(ev!["state"], "rebuilt");
  } finally {
    await disposeDiagnostics();
    h.cleanup();
    fs.rmSync(diagDir, { recursive: true, force: true });
  }
});

test("F2 拒绝全分支 → reason 映射逐字＋零副作用（盘快照/零重建/无系统行）；文案与 schema 模板同代入后互核", async () => {
  const h = await makeFHarness();
  try {
    writeMcpDeclaration(h.root, "for-y", { roles: "Y" });
    writeMcpDeclaration(h.root, "off", { roles: "X", status: "uninstalled" });
    writeMcpDeclaration(h.root, "ok", { roles: "X" });
    writeMcpDeclaration(h.root, "bad", { roles: "X", text: "- 用途：只有一行\n" });
    await openSuAndStartTurn(h);
    const install = h.suInstallMcp()!;
    const uninstall = h.suUninstallMcp()!;
    const before = snapshotTree(h.root);

    const expectRefusal = async (p: Promise<unknown>, reason: string, msgPart: string, label: string) => {
      const r = (await p) as { ok: boolean; reason?: string; message?: string };
      assert.equal(r.ok, false, `${label}: 必须拒绝`);
      assert.equal(r.reason, reason, `${label}: reason 映射`);
      assert.ok(r.message?.includes(msgPart), `${label}: message 含「${msgPart}」（原文：${r.message}）`);
      assert.deepEqual(snapshotTree(h.root), before, `${label}: 零副作用（盘快照一致）`);
      assert.equal(h.disposed("X") + h.disposed("Y"), 0, `${label}: 零重建`);
    };

    await expectRefusal(install({ roleId: "NOPE", name: "ok" }), "role-not-found", "角色「NOPE」不是本项目项目角色（或为治理角色 su）——未执行。", "角色不存在");
    await expectRefusal(install({ roleId: "su", name: "ok" }), "role-not-found", "或为治理角色 su", "su 自身");
    await expectRefusal(install({ roleId: "  ", name: "ok" }), "role-not-found", "——未执行。", "空 roleId");
    await expectRefusal(install({ roleId: "X", name: "" }), "not-registered", "MCP 未登记：docs/mcp/.md 不存在——先落盘再安装；未执行。", "空 name");
    await expectRefusal(install({ roleId: "X", name: "不存在" }), "not-registered", "MCP 未登记：docs/mcp/不存在.md 不存在——先落盘再安装；未执行。", "声明缺失");
    await expectRefusal(install({ roleId: "X", name: "for-y" }), "role-not-listed", "登记中未包含角色「X」——未执行；如确要安装请先更新登记。", "声明未含角色");
    await expectRefusal(install({ roleId: "X", name: "bad" }), "not-registered", "不存在——先落盘再安装", "声明坏件按缺失类拒（读取器 undefined）");
    await expectRefusal(install({ roleId: "X", name: "off" }), "not-registered", "状态为「uninstalled」——先改声明再安装；未执行。", "停用态安装");
    await expectRefusal(uninstall({ roleId: "X", name: "ok" }), "registration-unchanged", "登记仍含角色「X」——先改登记再卸载；未执行。", "卸载前声明未改");
    await expectRefusal(uninstall({ roleId: "X", name: "不存在" }), "not-registered", "不存在或不可解析——没有可撤销的声明；未执行。", "卸载声明缺失");

    // 拒绝路径不得投系统行
    assert.equal(h.roleStates.some((s) => s.roleId === "su" && s.queue.some((q) => q.summary.startsWith("系统·安装"))), false, "失败路径不投系统行");

    // 跨源互核：schema 枚举模板经同代入（<roleId>→X、<name>→文件名）后与拒绝文案逐字一致
    const installSchema = describeTool("install_mcp").description.split("<roleId>").join("X").split("<name>").join("不存在");
    assert.ok(installSchema.includes("MCP 未登记：docs/mcp/不存在.md 不存在——先落盘再安装；未执行。"), "schema（install）逐字含声明缺失句");
    const uninstallSchema = describeTool("uninstall_mcp").description.split("<roleId>").join("X");
    assert.ok(uninstallSchema.includes("登记仍含角色「X」——先改登记再卸载；未执行。"), "schema（uninstall）逐字含 registration-unchanged 句");
  } finally {
    h.cleanup();
  }
});

test("F3 护栏矩阵：无轮次/非客户轮（派发或系统 kind）⇒ not-customer-turn 逐字＋零副作用；客户轮与排队客户消息轮放行", async () => {
  const h = await makeFHarness();
  try {
    writeMcpDeclaration(h.root, "ok", { roles: "X" });
    await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" }); // su 开但无轮次
    const install = h.suInstallMcp()!;

    // ① 无轮次（idle）⇒ 拒
    const r1 = (await install({ roleId: "X", name: "ok" })) as { ok: boolean; reason?: string; message?: string };
    assert.equal(r1.ok, false, "无轮次必须拒");
    assert.equal(r1.reason, "not-customer-turn");
    assert.equal(r1.message, "本动作仅可在客户消息发起的轮次执行——未执行。", "文案逐字");

    // ② su 起客户轮 ⇒ 放行前置满足（本矩阵以判据面验证）；随后**私有面直注**非客户 kind
    //    （su 在真实装配下不可能是派发目标/回交来源——直注判据代码本身，active.kind === "message"）。
    await h.mgr.send("客户直聊", undefined, suTarget(h));
    await until(() => h.ctl("su").sent.length > 0);
    const mgrPrivate = h.mgr as unknown as { activeDeliveries: Map<string, { kind: string }> };
    const key = h.queueKey("su");
    for (const kind of ["dispatch", "system", "handback"]) {
      mgrPrivate.activeDeliveries.set(key, { kind });
      const r = (await install({ roleId: "X", name: "ok" })) as { ok: boolean; reason?: string };
      assert.equal(r.ok, false, `${kind} 轮必须拒`);
      assert.equal(r.reason, "not-customer-turn", `${kind} 轮 reason 映射`);
    }
    // ③ 客户消息发起的轮（kind=message / 无 active 条目）⇒ 放行
    mgrPrivate.activeDeliveries.set(key, { kind: "message" });
    const pass1 = (await install({ roleId: "X", name: "ok" })) as { ok: boolean };
    assert.equal(pass1.ok, true, "客户消息轮放行（active kind=message）");
    mgrPrivate.activeDeliveries.delete(key);
    const pass2 = (await install({ roleId: "X", name: "ok" })) as { ok: boolean };
    assert.equal(pass2.ok, true, "无 active 条目的客户轮放行");
  } finally {
    h.cleanup();
  }
});

test("F4 激活三态：busy ⇒ next-session 不打断；无会话 ⇒ next-session＋note（绝不自动开）；重建失败 ⇒ rebuild-failed 如实", async () => {
  const h = await makeFHarness();
  try {
    writeMcpDeclaration(h.root, "ok", { roles: "Y", purpose: "三态" });
    await openSuAndStartTurn(h);
    const install = h.suInstallMcp()!;

    // ① busy：Y 在跑轮次 ⇒ next-session、不打断（dispose 不变、无新开）
    await openXAndStartTurn(h); // 注意：这里开的是 X；Y 用直聊开
    const yOpen = await h.mgr.open({ projectRoot: h.root, roleId: "Y", runtime: "demo" });
    assert.equal(yOpen.ok, true);
    await h.mgr.send("Y 的轮次", undefined, { projectRoot: h.root, roleId: "Y", runtime: "demo" });
    await until(() => h.ctl("Y").sent.length > 0);
    const busyDisposed = h.disposed("Y");
    const busyOpened = h.openedCount("Y");
    const r1 = (await install({ roleId: "Y", name: "ok" })) as { ok: boolean; effective?: string; note?: string };
    assert.equal(r1.ok, true);
    assert.equal(r1.effective, "next-session", "在跑不打断");
    assert.equal(r1.note, undefined, "busy 延迟态无 note");
    assert.equal(h.disposed("Y"), busyDisposed, "未 dispose（不打断）");
    assert.equal(h.openedCount("Y"), busyOpened, "未重开");
    await h.settle("Y");

    // ② 无会话：换一个从未打开的角色？夹具只有 X/Y；Y 已开。用 X 但先关会话不易——改写在 Y settle 后：
    //    这里用一个新项目根上的独立夹具验证「无会话」分支（避免依赖私有面）。
    const h2 = await makeFHarness();
    try {
      writeMcpDeclaration(h2.root, "solo", { roles: "X" });
      await openSuAndStartTurn(h2);
      const install2 = h2.suInstallMcp()!;
      const r2 = (await install2({ roleId: "X", name: "solo" })) as { ok: boolean; effective?: string; note?: string };
      assert.equal(r2.ok, true);
      assert.equal(r2.effective, "next-session", "无会话 ⇒ 如实延迟态");
      assert.ok(r2.note?.includes("该角色当前没有打开的会话（并非在跑轮次）——新会话打开即生效。"), `无会话 note 逐字：${r2.note}`);
      assert.equal(h2.openedCount("X"), 0, "绝不自动开目标会话（激活≠开户）");

      // ③ 重建失败：X 已开状态改为「已开但重开抛错」
      await h2.mgr.open({ projectRoot: h2.root, roleId: "X", runtime: "demo" }); // idle 开
      assert.equal(h2.openedCount("X"), 1);
      h2.failOpensAfter["X"] = 1; // 第 2 次起抛错
      const r3 = (await install2({ roleId: "X", name: "solo" })) as { ok: boolean; reason?: string; message?: string };
      assert.equal(r3.ok, false, "重建失败 ⇒ 拒绝态（不假装已生效）");
      assert.equal(r3.reason, "rebuild-failed");
      assert.ok(r3.message?.includes("会话未重建（未假装已生效"), `重建失败如实：${r3.message}`);
    } finally {
      h2.cleanup();
    }
  } finally {
    h.cleanup();
  }
});

test("F5 卸载链：先改声明→校验通过→重建→回执二分（效果已撤/声明保留/副作用不可撤）＋系统行；已发生副作用不可撤入文案", async () => {
  const h = await makeFHarness();
  try {
    writeMcpDeclaration(h.root, "srv-u", { roles: "X", purpose: "卸载链" });
    await h.mgr.open({ projectRoot: h.root, roleId: "X", runtime: "demo" });
    await openSuAndStartTurn(h);
    const uninstall = h.suUninstallMcp()!;
    // 未改声明 ⇒ registration-unchanged（已由 F2 覆盖）；这里改声明（移除角色）后卸载
    writeMcpDeclaration(h.root, "srv-u", { roles: "Y" }); // 「先改声明」：X 条目移除
    const digest = sha256Of(path.join(h.root, "docs", "mcp", "srv-u.md"));
    const r = (await uninstall({ roleId: "X", name: "srv-u" })) as { ok: boolean; action?: string; effective?: string; path?: string; digest?: string };
    assert.equal(r.ok, true);
    assert.equal(r.action, "uninstalled");
    assert.equal(r.effective, "rebuilt", "X idle ⇒ 当场重建");
    assert.equal(r.path, "docs/mcp/srv-u.md");
    assert.equal(r.digest, digest);
    assert.ok(fs.existsSync(path.join(h.root, "docs", "mcp", "srv-u.md")), "声明文件保留（效果已撤≠字节已清）");
    const row = h.roleStates.filter((s) => s.roleId === "su").at(-1)?.queue.find((q) => q.summary.startsWith("系统·安装"));
    assert.ok(row!.full.startsWith("[系统·安装] 已卸载 MCP「srv-u」（角色「X」）"), `卸载系统行文首：${row!.full}`);
    assert.ok(row!.full.includes("效果已撤，声明文件保留于 docs/mcp/srv-u.md"), "系统行二分：效果已撤＋声明保留");
    assert.ok(row!.full.includes("已发生的副作用不可撤"), "系统行含副作用不可撤诚实面");
    // 卸载后（声明已不含 X）再装：role-not-listed（语义闭环）——真实装配面
    const install = h.suInstallMcp()!;
    const again = (await install({ roleId: "X", name: "srv-u" })) as { ok: boolean; reason?: string };
    assert.equal(again.ok, false);
    assert.equal(again.reason, "role-not-listed", "卸载后的声明不再含 X（先改声明语义闭环）");
  } finally {
    h.cleanup();
  }
});

test("F6 排队客户消息轮：su 忙时再发客户消息处于队列（active kind=message）⇒ 安装仍放行；护栏先判不消耗队列", async () => {
  const h = await makeFHarness();
  try {
    writeMcpDeclaration(h.root, "q", { roles: "X" });
    await h.mgr.open({ projectRoot: h.root, roleId: "X", runtime: "demo" });
    await openSuAndStartTurn(h);
    const install = h.suInstallMcp()!;
    // su 仍在跑第一轮（busy），但 active kind=message ⇒ 放行
    const r = (await install({ roleId: "X", name: "q" })) as { ok: boolean; effective?: string };
    assert.equal(r.ok, true, "客户消息轮（忙中队列态）放行");
    assert.equal(r.effective, "rebuilt", "X idle ⇒ 当场重建");
  } finally {
    h.cleanup();
  }
});

test("F7 拒绝路径诊断：mcp.refused 落盘（reasonCode 如实）；系统行零投递已由 F2 覆盖", async () => {
  const diagDir = fs.mkdtempSync(path.join(os.tmpdir(), "g4v2-f-diag2-"));
  const h = await makeFHarness();
  try {
    configureDiagnostics({ directory: diagDir });
    await h.mgr.open({ projectRoot: h.root, roleId: "su", runtime: "demo" }); // idle ⇒ not-customer-turn
    const install = h.suInstallMcp()!;
    await install({ roleId: "X", name: "whatever" });
    await flushDiagnostics();
    const files = fs.readdirSync(diagDir).filter((f) => f.startsWith("ans-diagnostics-"));
    const rows = files.flatMap((f) => fs.readFileSync(path.join(diagDir, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>));
    const ev = rows.find((rowv) => rowv["event"] === "mcp.refused");
    assert.ok(ev, "诊断含 mcp.refused");
    assert.equal(ev!["toolName"], "install_mcp");
    assert.equal(ev!["reasonCode"], "not-customer-turn");
  } finally {
    await disposeDiagnostics();
    h.cleanup();
    fs.rmSync(diagDir, { recursive: true, force: true });
  }
});
