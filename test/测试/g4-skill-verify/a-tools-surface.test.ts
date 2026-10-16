// test/测试/g4-skill-verify/a-tools-surface.test.ts —— G-4 独立验证 A 域：**工具面**。
//
// 对抗性独立构造（不复用实施方断言）：
// ① 注入才注册（四组合矩阵：注入 install/不注入 × 注入 uninstall/不注入——只 su 注入由调用侧表达）；
// ② 回执冻结形状逐字段＋契约外回执 fail-closed（action 不符/缺 digest/effective 非法/null/抛错/预中止）；
// ③ 失败文案与 schema 逐字（独立重打 PM 冻结句中锚点）；
// ④ 工具零写盘（结构性源码切片核对＋行为树快照）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { buildGovernedTools } from "../../../src/provider/runtime/tools.ts";
import { describeTool } from "../../../src/provider/runtime/schema.ts";
import type { InstallSkillFn, InstallSkillPayload, InstallSkillReceipt, ToolResult, UninstallSkillFn } from "../../../src/model/runtime.ts";
import type { WriteGate } from "../../../src/model/runtime.ts";

import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const denylessGate: WriteGate = () => ({ allowed: false, reason: "工具面用例不触写", allowedByRoot: { project: [], skill: [] } });

function names(options: Parameters<typeof buildGovernedTools>[1]): string[] {
  return buildGovernedTools(denylessGate, options).map((t) => t.name);
}

async function callTool(options: Parameters<typeof buildGovernedTools>[1], name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
  const tool = buildGovernedTools(denylessGate, options).find((t) => t.name === name);
  assert.ok(tool, `工具 ${name} 应已注册`);
  return tool.handler({ name, args, toolCallId: name, ...(signal ? { signal } : {}) });
}

const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

// —————————————————————— ① 注入才注册 ——————————————————————

test("注入才注册（对抗四组合）：两工具各自独立，未注入即结构性不存在", () => {
  const installFn: InstallSkillFn = async () => ({ ok: false, reason: "r", message: "m" });
  const uninstallFn: UninstallSkillFn = async () => ({ ok: false, reason: "r", message: "m" });

  const neither = names({});
  assert.equal(neither.includes("install_skill"), false, "未注入 ⇒ install_skill 不得存在");
  assert.equal(neither.includes("uninstall_skill"), false, "未注入 ⇒ uninstall_skill 不得存在");

  const onlyInstall = names({ installSkill: installFn });
  assert.equal(onlyInstall.includes("install_skill"), true, "注入 installSkill ⇒ install_skill 注册");
  assert.equal(onlyInstall.includes("uninstall_skill"), false, "未注入 uninstallSkill ⇒ uninstall_skill 仍不得存在（两能力互不搭车）");

  const onlyUninstall = names({ uninstallSkill: uninstallFn });
  assert.equal(onlyUninstall.includes("uninstall_skill"), true, "注入 uninstallSkill ⇒ uninstall_skill 注册");
  assert.equal(onlyUninstall.includes("install_skill"), false, "未注入 installSkill ⇒ install_skill 仍不得存在");

  const both = names({ installSkill: installFn, uninstallSkill: uninstallFn });
  assert.equal(both.includes("install_skill"), true);
  assert.equal(both.includes("uninstall_skill"), true);
});

// —————————————————————— ② 回执冻结形状＋契约外 fail-closed ——————————————————————

const OK_RECEIPT: InstallSkillReceipt = {
  ok: true,
  action: "installed",
  roleId: "X",
  name: "s1",
  path: "docs/skills/s1/SKILL.md",
  digest: "a".repeat(64),
  effective: "rebuilt",
};

test("回执（rebuilt）：载荷逐字路由 {roleId,name}；呈现 path＋digest 前 12 位＋即刻生效＋写边界不变句", async () => {
  const seen: InstallSkillPayload[] = [];
  const fn: InstallSkillFn = async (payload) => {
    seen.push(payload);
    return OK_RECEIPT;
  };
  const r = await callTool({ installSkill: fn }, "install_skill", { roleId: "X", name: "s1", 莫名: "多余字段" });
  assert.equal(r.ok, true);
  assert.deepEqual(seen, [{ roleId: "X", name: "s1" }], "能力只收 {roleId,name}（多余字段不路由）");
  assert.ok(r.message.includes("docs/skills/s1/SKILL.md"), "path 呈现");
  assert.ok(r.message.includes(`sha256 ${"a".repeat(12)}`), "digest 展示恰为前 12 位");
  assert.ok(r.message.includes("已重建该角色会话、即刻生效"), "rebuilt 文案");
  assert.ok(r.message.includes("未改变任何角色的写边界"), "成功回执重申「安装 ≠ 授权」");
});

test("回执（next-session 如实延迟态）：如实「在跑不打断」，绝不称即刻生效", async () => {
  const fn: InstallSkillFn = async () => ({ ...OK_RECEIPT, effective: "next-session" });
  const r = await callTool({ installSkill: fn }, "install_skill", { roleId: "X", name: "s1" });
  assert.equal(r.ok, true);
  assert.ok(r.message.includes("该角色正在运行轮次（不打断）——新会话起生效"), "延迟态文案逐字");
  assert.equal(r.message.includes("即刻生效"), false, "延迟态不得称即刻生效");
});

test("回执（params 别名与缺参）：roleId 别名 role_id/role 可用；name 无别名；缺参不触达能力", async () => {
  let calls = 0;
  const fn: InstallSkillFn = async () => {
    calls += 1;
    return OK_RECEIPT;
  };
  const alias = await callTool({ installSkill: fn }, "install_skill", { role_id: "X", name: "s1" });
  assert.equal(alias.ok, true);
  const alias2 = await callTool({ installSkill: fn }, "install_skill", { role: "X", name: "s1" });
  assert.equal(alias2.ok, true);
  assert.equal(calls, 2);
  const noRole = await callTool({ installSkill: fn }, "install_skill", { name: "s1" });
  assert.equal(noRole.ok, false);
  assert.ok(noRole.message.includes("缺少 roleId"));
  const noName = await callTool({ installSkill: fn }, "install_skill", { roleId: "X", role_id: "Y", name: "  " });
  assert.equal(noName.ok, false);
  assert.ok(noName.message.includes("缺少 name"));
  assert.equal(calls, 2, "缺参路径不得触达能力（零副作用）");
});

test("契约外回执一律 fail-closed：action 不符/缺 digest/effective 非法/null/抛错——绝不称已安装/已卸载", async () => {
  const cases: [string, unknown][] = [
    ["action 不符", { ...OK_RECEIPT, action: "uninstalled" }],
    ["缺 digest", { ok: true, action: "installed", roleId: "X", name: "s1", path: "p", effective: "rebuilt" }],
    ["digest 空串", { ...OK_RECEIPT, digest: "" }],
    ["effective 非法", { ...OK_RECEIPT, effective: "immediate" }],
    ["ok 非布尔", { ok: "yes", action: "installed" }],
    ["null", null],
    ["无对象", "已安装"],
  ];
  for (const [label, receipt] of cases) {
    const fn: InstallSkillFn = async () => receipt as InstallSkillReceipt;
    const r = await callTool({ installSkill: fn }, "install_skill", { roleId: "X", name: "s1" });
    assert.equal(r.ok, false, `${label}：必须 fail-closed`);
    assert.ok(r.message.includes("不要当它已安装") || r.message.includes("如实告知客户"), `${label}：文案须明示未执行`);
  }
  const thrown: InstallSkillFn = async () => {
    throw new Error("能力内部炸了");
  };
  const r = await callTool({ installSkill: thrown }, "install_skill", { roleId: "X", name: "s1" });
  assert.equal(r.ok, false);
  assert.ok(r.message.includes("能力内部炸了"), "抛错原因如实转达");
  assert.ok(r.message.includes("不要当它已安装"), "抛错不得称已安装");

  // 预中止：能力零调用。
  let calls = 0;
  const spy: InstallSkillFn = async () => {
    calls += 1;
    return OK_RECEIPT;
  };
  const controller = new AbortController();
  controller.abort();
  const aborted = await callTool({ installSkill: spy }, "install_skill", { roleId: "X", name: "s1" }, controller.signal);
  assert.equal(aborted.ok, false);
  assert.equal(calls, 0, "预中止不得触达能力");
  assert.ok(aborted.message.includes("会话已中止"));
});

test("卸载工具同名同形：expectedAction=uninstalled；成功文案含「效果已撤；文件保留于」（二分陈述）", async () => {
  const uninstall: UninstallSkillFn = async () => ({
    ok: true,
    action: "uninstalled",
    roleId: "X",
    name: "s1",
    path: "docs/skills/s1/SKILL.md",
    digest: "b".repeat(64),
    effective: "rebuilt",
  });
  const r = await callTool({ uninstallSkill: uninstall }, "uninstall_skill", { roleId: "X", name: "s1" });
  assert.equal(r.ok, true);
  assert.ok(r.message.includes("效果已撤；文件保留于 docs/skills/s1/SKILL.md"), "卸载二分陈述：效果已撤＋文件保留");
  // 交互对抗：install 能力的回执给 uninstall 工具（action 不符）⇒ 拒绝。
  const wrong: UninstallSkillFn = async () => OK_RECEIPT as unknown as InstallSkillReceipt;
  const r2 = await callTool({ uninstallSkill: wrong }, "uninstall_skill", { roleId: "X", name: "s1" });
  assert.equal(r2.ok, false);
  assert.ok(r2.message.includes("不要当它已卸载"));
});

test("护栏拒绝原样转达：reason=not-customer-turn ⇒ 未执行、零副作用、原文逐字", async () => {
  const fn: InstallSkillFn = async () => ({ ok: false, reason: "not-customer-turn", message: "本动作仅可在客户消息发起的轮次执行——未执行。" });
  const r = await callTool({ installSkill: fn }, "install_skill", { roleId: "X", name: "s1" });
  assert.equal(r.ok, false);
  assert.ok(r.message.includes("reason: not-customer-turn"), "reason 机读标识透传");
  assert.ok(r.message.includes("本动作仅可在客户消息发起的轮次执行——未执行。"), "message 原文逐字");
  assert.ok(r.message.includes("零副作用"), "零副作用明示");
});

// —————————————————————— ③ 失败文案与 schema 逐字 ——————————————————————

test("schema 冻结文案逐字（独立重打锚点）：install_skill / uninstall_skill 失败枚举与纪律句", () => {
  const install = describeTool("install_skill");
  const desc = install.description ?? "";
  for (const anchor of [
    "仅客户明示时安装",
    "不得自主发起",
    "not-customer-turn：`本动作仅可在客户消息发起的轮次执行——未执行。`",
    "先落盘再激活",
    "本工具**不写盘、不做治理判定**",
    "技能未登记：docs/skills/<name>/install.md 不存在——先落盘再安装；未执行。",
    "登记中未包含角色「<roleId>」——未执行；如确要安装请先更新登记。",
    "角色「<roleId>」不是本项目项目角色（或为治理角色 su）——未执行。",
    "安装不改变任何角色的写边界",
    "不得**把失败或延迟说成已生效",
  ]) {
    assert.ok(desc.includes(anchor), `install_skill 描述缺锚点：${anchor}`);
  }
  const guidelines = install.promptGuidelines ?? [];
  assert.equal(guidelines.some((g) => g.includes("仅限客户明示")), true, "guidelines 含「仅限客户明示」");
  assert.equal(guidelines.some((g) => g.includes("先落盘再激活")), true, "guidelines 含「先落盘再激活」");
  assert.equal(guidelines.some((g) => g.includes("不改变任何角色的写边界")), true, "guidelines 含「不改变写边界」");

  const uninstall = describeTool("uninstall_skill");
  const udesc = uninstall.description ?? "";
  for (const anchor of [
    "仅客户明示时卸载",
    "先改登记再卸载",
    "登记仍含角色「<roleId>」——先改登记再卸载；未执行。",
    "文件保留",
    "如实区分「效果已撤」与「文件仍在」",
    "未执行、零副作用",
  ]) {
    assert.ok(udesc.includes(anchor), `uninstall_skill 描述缺锚点：${anchor}`);
  }
  const uguides = uninstall.promptGuidelines ?? [];
  assert.equal(uguides.some((g) => g.includes("仅限客户明示")), true);
  assert.equal(uguides.some((g) => g.includes("先改登记再卸载")), true);

  // 参数面：两工具 required=[roleId,name]、无 executionMode（不声明 sequential）。
  for (const t of [install, uninstall]) {
    assert.deepEqual(t.parameters["required"], ["roleId", "name"]);
    assert.equal(t.executionMode, undefined, "技能两工具不得声明 executionMode 覆盖（默认并行批）");
  }
});

// —————————————————————— ④ 工具零写盘 ——————————————————————

test("零写盘（结构性）：makeSkillReceiptTool 源码切片不含任何写盘原语", () => {
  const src = fs.readFileSync(path.join(HERE, "..", "..", "..", "src", "provider", "runtime", "tools.ts"), "utf8");
  const start = src.indexOf("function makeSkillReceiptTool");
  const end = src.indexOf("function makeInstallSkillTool");
  assert.ok(start >= 0 && end > start, "须能定位 makeSkillReceiptTool 切片");
  const slice = src.slice(start, end);
  for (const banned of ["writeFileSync", "writeFile", "appendFile", "mkdir", "unlink", "rmSync", "rm(", "rename", "copyFile", "createWriteStream", "openSync"]) {
    assert.equal(slice.includes(banned), false, `切片不得含写盘原语：${banned}`);
  }
});

test("零写盘（行为）：真实盘快照前后逐字节一致——成功与失败两路", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g4-tool-nodisk-"));
  try {
    fs.mkdirSync(path.join(root, "docs", "skills", "s1"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "skills", "s1", "SKILL.md"), "内容\n");
    fs.writeFileSync(path.join(root, "docs", "skills", "s1", "install.md"), "# 登记\n- 用途：p\n- 适用角色：X\n- 状态：installed\n- 安装日期：2026-10-16\n");
    const snap = (): string => {
      const out: string[] = [];
      const walk = (d: string): void => {
        for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
          const abs = path.join(d, e.name);
          out.push(`${path.relative(root, abs)}:${e.isDirectory() ? "<dir>" : sha(fs.readFileSync(abs))}`);
          if (e.isDirectory()) walk(abs);
        }
      };
      walk(root);
      return out.join("|");
    };
    const before = snap();
    const real = new URL("file://" + root).pathname;
    await callTool({ installSkill: async (p) => ({ ok: true, action: "installed", roleId: p.roleId, name: p.name, path: `docs/skills/${p.name}/SKILL.md`, digest: sha("内容\n"), effective: "rebuilt" }) }, "install_skill", { roleId: "X", name: "s1" });
    await callTool({ installSkill: async () => ({ ok: false, reason: "not-registered", message: "技能未登记——未执行。" }) }, "install_skill", { roleId: "X", name: "不存在" });
    assert.equal(snap(), before, `工具层触碰了盘（${real}）`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
