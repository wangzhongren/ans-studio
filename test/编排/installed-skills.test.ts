// test/编排/installed-skills.test.ts
// 编排角色自测：G-4 I4「会话开局注入」渲染单一来源
// （产品提案 `角色卡/产品/docs/design/2026-10-16_design_role-capability-install.md` §4.1/§4.2；
// 客户 2026-10-16 批准 G-4 V1 实施，十项裁定全采纳）。
//
// 本文件钉死（三适配器接线的落盘契约＝导出路径与签名）：
//   · `renderInstalledSkillsSection(projectRoot, roleId): string`——**两参调用必须可用**（默认调用）；
//     第三参为可选诊断回调（坏件观察面；抛错被吞，不得影响注入）。
//   · `readSkillRegistration(projectRoot, name): SkillRegistrationView | undefined`（I3 前置，PM 派发）
//     ——登记读取公开视图；与渲染器**共用同一加载判据**（单一解析来源）；坏件/缺失 ⇒ undefined
//     （同坏件集，双向核）；`uninstalled`/角色不命中非坏件、原样返回视图。
//   · G-4 能力位接线（I1/I2 工具末环）：`openRoleSession` 的 `installSkill`/`uninstallSkill` **只给 su**
//     透传（桩捕获逐名核对注入引用）；端到端经真实装配注册两工具且 handler 直达注入实现；项目角色
//     零感知（误给不注入、不注册；未给不注入）。
//   · G-4 V2 能力位接线（MCP 安装工具末环，2026-10-16 客户批准 V2；同链同桩）：`openRoleSession` 的
//     `installMcp`/`uninstallMcp` **只给 su** 透传；端到端经真实装配注册 `install_mcp`/`uninstall_mcp`
//     且 handler 直达注入实现；项目角色零注册；未给不注入。
//   · 判据链：扫 `docs/skills/<name>/` → 读 `install.md` 登记（用途/适用角色/状态/安装日期四字段）
//     → 状态 installed 且角色命中 → 校验 `SKILL.md` 并按**当刻字节**算 sha256 → 按 name 排序、编号递增渲染。
//   · 坏件（登记缺失/解析失败/SKILL.md 缺失/名非法/根不可读）⇒ 该条跳过＋诊断；**绝不拒开会话**
//     （函数绝不抛错）；role 不命中 / 状态 uninstalled 属正常过滤——静默跳过、无诊断。
//   · 零技能 ⇒ 返回空串（调用侧零渲染）；冻结文案逐字（金文本用例在测试内独立重打，模块常量漂移即红）。
// 全程系统临时目录，用后清理；不触网、不触真项目。

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { renderInstalledSkillsSection, readSkillRegistration } from "../../src/common/编排/installed-skills.ts";
import type { InstalledSkillsDiagnostic } from "../../src/common/编排/installed-skills.ts";
import { configureDiagnostics, flushDiagnostics, disposeDiagnostics } from "../../src/common/shared/diagnostics.ts";
import type { ProjectConfig } from "../../src/model/role.ts";
import type { RoleSession, RuntimeAdapter, SessionEvent, WriteGate } from "../../src/provider/pi/session.ts";
import type { InstallSkillFn, InstallSkillPayload, RuntimeProviderFactory, RuntimeProviderOptions, ToolResult, UninstallSkillFn, InstallMcpFn, InstallMcpPayload, UninstallMcpFn } from "../../src/model/runtime.ts";
import { openRoleSession } from "../../src/pipeline/orchestration/run-role.ts";
import type { AdapterCapabilities } from "../../src/pipeline/orchestration/run-role.ts";

// —— 冻结文案（测试内独立重打：与模块常量逐字对照，模块漂移必红） ——
const HEADER = "## 本角色已安装技能（动手前先读，按序）";
const FOOTER = "内容以文件当刻字节为准；读到与派发描述/版本不符 ⇒ 停止并交 blocked 报告（不得猜）。";

const sha = (bytes: Buffer | string): string => createHash("sha256").update(bytes).digest("hex");

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ans-installed-skills-"));
}

function cleanup(...roots: string[]): void {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}

/** 按 §4.1 模板产登记文本（可逐字段覆写/留空以构造坏件）；`undefined` 值 ⇒ 该行不写。 */
function registrationText(name: string, opts: {
  purpose?: string | undefined;
  roles?: string | undefined;
  status?: string | undefined;
  date?: string | undefined;
} = {}): string {
  const lines = [`# 安装登记：${name}`];
  const purpose = "purpose" in opts ? opts.purpose : "示例用途";
  const roles = "roles" in opts ? opts.roles : "A";
  const status = "status" in opts ? opts.status : "installed";
  const date = "date" in opts ? opts.date : "2026-10-16";
  if (purpose !== undefined) lines.push(`- 用途：${purpose}`);
  if (roles !== undefined) lines.push(`- 适用角色：${roles}`);
  if (status !== undefined) lines.push(`- 状态：${status}`);
  if (date !== undefined) lines.push(`- 安装日期：${date}`);
  return lines.join("\n") + "\n";
}

/** 建 `docs/skills/<name>/`；`registration`/`content` 为 undefined 则对应文件不写（坏件构造面）。 */
function writeSkill(root: string, name: string, registration?: string, content?: string | Buffer): void {
  const dir = path.join(root, "docs", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  if (registration !== undefined) fs.writeFileSync(path.join(dir, "install.md"), registration);
  if (content !== undefined) fs.writeFileSync(path.join(dir, "SKILL.md"), content);
}

// —— 金文本与 digest ——

test("金文本：单技能命中 → 冻结格式逐字（标题/编号/用途/digest/日期取 ISO/尾句）；默认两参调用", () => {
  const root = makeRoot();
  try {
    const bytes = Buffer.from("# 技能：alpha\n正文\n", "utf8");
    writeSkill(root, "alpha", registrationText("alpha", {
      purpose: "顺手校验数值边界",
      roles: "A",
      date: "2026-10-16（按客户指令）", // 行内日期带后缀 ⇒ 渲染取首个 YYYY-MM-DD
    }), bytes);
    const expected = [
      HEADER,
      `1. docs/skills/alpha/SKILL.md（用途：顺手校验数值边界；sha256:${sha(bytes)}；安装于 2026-10-16）`,
      FOOTER,
    ].join("\n");
    assert.equal(renderInstalledSkillsSection(root, "A"), expected, "冻结文案逐字；日期取 ISO 片段");
  } finally {
    cleanup(root);
  }
});

test("digest＝SKILL.md 当刻字节 sha256（原始字节、不经 UTF-8 解码；内容变化 digest 变化）", () => {
  const root = makeRoot();
  try {
    const first = Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x00, 0x41]); // 含非 UTF-8 字节
    writeSkill(root, "bin", registrationText("bin", { roles: "A" }), first);
    const rendered1 = renderInstalledSkillsSection(root, "A");
    assert.ok(rendered1.includes(`sha256:${sha(first)}`), "对原始字节算哈希——先解码再哈希会得不同值");
    const second = Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x00, 0x42]);
    fs.writeFileSync(path.join(root, "docs", "skills", "bin", "SKILL.md"), second);
    const rendered2 = renderInstalledSkillsSection(root, "A");
    assert.ok(rendered2.includes(`sha256:${sha(second)}`), "以文件当刻字节为准：变更后 digest 随之变更");
    assert.notEqual(rendered1, rendered2);
  } finally {
    cleanup(root);
  }
});

test("多技能：按 name 排序、编号自 1 递增；各技能用途/digest 各归各位", () => {
  const root = makeRoot();
  try {
    // 乱序落盘：zeta → alpha → mid；期望按 name 代码单元序 alpha < mid < zeta。
    writeSkill(root, "zeta", registrationText("zeta", { purpose: "Z 用途", roles: "A" }), "Z 内容");
    writeSkill(root, "alpha", registrationText("alpha", { purpose: "A 用途", roles: "A" }), "A 内容");
    writeSkill(root, "mid", registrationText("mid", { purpose: "M 用途", roles: "A" }), "M 内容");
    const lines = renderInstalledSkillsSection(root, "A").split("\n");
    assert.equal(lines[0], HEADER);
    assert.equal(lines[1], `1. docs/skills/alpha/SKILL.md（用途：A 用途；sha256:${sha("A 内容")}；安装于 2026-10-16）`);
    assert.equal(lines[2], `2. docs/skills/mid/SKILL.md（用途：M 用途；sha256:${sha("M 内容")}；安装于 2026-10-16）`);
    assert.equal(lines[3], `3. docs/skills/zeta/SKILL.md（用途：Z 用途；sha256:${sha("Z 内容")}；安装于 2026-10-16）`);
    assert.equal(lines[4], FOOTER);
    assert.equal(lines.length, 5, "无多余行");
  } finally {
    cleanup(root);
  }
});

// —— 零技能与角色/状态过滤 ——

test("零技能零渲染：无 docs/skills 目录 / 空目录 / 仅有非目录文件 / 空 projectRoot → 空串，且无诊断", () => {
  const root = makeRoot();
  const skips: InstalledSkillsDiagnostic[] = [];
  try {
    assert.equal(renderInstalledSkillsSection(root, "A", (d) => skips.push(d)), "", "无 docs/skills ⇒ 空串（从未装过技能＝正常态）");
    fs.mkdirSync(path.join(root, "docs", "skills"), { recursive: true });
    assert.equal(renderInstalledSkillsSection(root, "A", (d) => skips.push(d)), "", "空目录 ⇒ 空串");
    fs.writeFileSync(path.join(root, "docs", "skills", "README.md"), "说明文件，不是技能条目\n");
    assert.equal(renderInstalledSkillsSection(root, "A", (d) => skips.push(d)), "", "非目录条目不是技能（忽略）");
    assert.equal(renderInstalledSkillsSection("", "A", (d) => skips.push(d)), "", "空 projectRoot ⇒ 空串");
    assert.equal(renderInstalledSkillsSection("   ", "A", (d) => skips.push(d)), "", "空白 projectRoot ⇒ 空串");
    assert.deepEqual(skips, [], "以上全是正常态——不该产任何诊断");
  } finally {
    cleanup(root);
  }
});

test("角色过滤：未命中静默跳过（不读 SKILL.md、不产诊断）；多角色列表（顿号/全角逗号/反引号）命中", () => {
  const root = makeRoot();
  const skips: InstalledSkillsDiagnostic[] = [];
  try {
    // 别角色 + 坏内容：本角色会话不得被它扰动（连诊断都不该有——登记为别角色、本角色不校验其 SKILL.md）。
    writeSkill(root, "other", registrationText("other", { roles: "B" })); // 无 SKILL.md
    assert.equal(renderInstalledSkillsSection(root, "A", (d) => skips.push(d)), "", "别角色技能不注入");
    assert.equal(skips.length, 0, "别角色条目的坏件面不属本角色会话（静默）");
    // 多角色列表：顿号/全角逗号分隔、反引号包裹、空格——trim 与去包裹后精确命中。
    writeSkill(root, "multi", registrationText("multi", { roles: "B、`A`，C" }), "多角色内容");
    const text = renderInstalledSkillsSection(root, "A", (d) => skips.push(d));
    assert.ok(text.includes(`1. docs/skills/multi/SKILL.md（用途：示例用途；sha256:${sha("多角色内容")}；安装于 2026-10-16）`), "A 命中");
    assert.equal(renderInstalledSkillsSection(root, "B", () => {}).includes("multi"), true, "B 也命中");
    assert.equal(renderInstalledSkillsSection(root, "C", () => {}).includes("multi"), true, "C 也命中");
    assert.equal(renderInstalledSkillsSection(root, "x", () => {}), "", "未列出角色不命中（精确匹配）");
  } finally {
    cleanup(root);
  }
});

test("状态过滤：uninstalled 静默跳过（正常停用，无诊断）；未知状态值＝坏件跳过＋诊断（状态不明不猜）", () => {
  const root = makeRoot();
  const skips: InstalledSkillsDiagnostic[] = [];
  try {
    writeSkill(root, "off", registrationText("off", { roles: "A", status: "uninstalled" }), "内容仍在文件");
    assert.equal(renderInstalledSkillsSection(root, "A", (d) => skips.push(d)), "", "uninstalled ⇒ 不注入");
    assert.equal(skips.length, 0, "uninstalled 是已知态——不算坏件");
    writeSkill(root, "typo", registrationText("typo", { roles: "A", status: "instaled" }), "内容");
    assert.equal(renderInstalledSkillsSection(root, "A", (d) => skips.push(d)), "", "未知状态 ⇒ 不注入");
    assert.deepEqual(skips, [{ path: "docs/skills/typo/install.md", reason: "registration-parse-failed", detail: "未知状态值：instaled" }]);
  } finally {
    cleanup(root);
  }
});

// —— 坏件跳过（绝不拒开会话） ——

test("坏件跳过：登记缺失/字段缺失/SKILL.md 缺失逐条跳过＋诊断；同目录下其余技能照常注入（默认两参不抛错）", () => {
  const root = makeRoot();
  const skips: InstalledSkillsDiagnostic[] = [];
  try {
    writeSkill(root, "no-reg"); // install.md 缺失
    writeSkill(root, "no-status", registrationText("no-status", { roles: "A", status: undefined }), "内容"); // 状态字段缺失
    writeSkill(root, "no-content", registrationText("no-content", { roles: "A" }), undefined); // SKILL.md 缺失
    writeSkill(root, "good", registrationText("good", { purpose: "好件", roles: "A" }), "好件内容");
    const text = renderInstalledSkillsSection(root, "A", (d) => skips.push(d));
    assert.equal(text, [
      HEADER,
      `1. docs/skills/good/SKILL.md（用途：好件；sha256:${sha("好件内容")}；安装于 2026-10-16）`,
      FOOTER,
    ].join("\n"), "坏件跳过后好件照常（会话不因坏件被拒）");
    assert.deepEqual(
      skips.map((d) => [d.path, d.reason]),
      [
        ["docs/skills/no-content/SKILL.md", "skill-file-missing"],
        ["docs/skills/no-reg/install.md", "registration-missing"],
        ["docs/skills/no-status/install.md", "registration-parse-failed"],
      ],
      "坏件逐条诊断（按目录扫描序，path 指向坏在哪件文件——SKILL.md 缺失则指向内容文件）",
    );
    // 默认两参调用必须可用（不给回调，坏件不抛错、仍返回好件）。
    assert.equal(renderInstalledSkillsSection(root, "A"), text, "两参调用与三参渲染一致（回调只是观察面）");
  } finally {
    cleanup(root);
  }
});

test("四字段缺一即坏件：用途/适用角色/状态/安装日期各自缺失 → 该条跳过＋诊断（绝不猜补）", () => {
  const root = makeRoot();
  try {
    const missing: ("purpose" | "roles" | "status" | "date")[] = ["purpose", "roles", "status", "date"];
    for (const field of missing) {
      const name = `m-${field}`;
      writeSkill(root, name, registrationText(name, { roles: "A", [field]: undefined }), "内容");
      const skips: InstalledSkillsDiagnostic[] = [];
      assert.equal(renderInstalledSkillsSection(root, "A", (d) => skips.push(d)), "", `缺 ${field} ⇒ 该条不注入`);
      assert.ok(
        skips.length >= 1 && skips.every((d) => d.reason === "registration-parse-failed"),
        `缺 ${field} ⇒ 解析失败诊断（累计坏件数：${skips.length}）`,
      );
    }
  } finally {
    cleanup(root);
  }
});

test("SKILL.md 是目录（EISDIR）→ 该条按缺失跳过＋诊断；防御不抛错", () => {
  const root = makeRoot();
  const skips: InstalledSkillsDiagnostic[] = [];
  try {
    writeSkill(root, "dir-content", registrationText("dir-content", { roles: "A" }));
    fs.mkdirSync(path.join(root, "docs", "skills", "dir-content", "SKILL.md"));
    assert.equal(renderInstalledSkillsSection(root, "A", (d) => skips.push(d)), "");
    assert.equal(skips.length, 1);
    assert.equal(skips[0]!.path, "docs/skills/dir-content/SKILL.md");
    assert.equal(skips[0]!.reason, "skill-file-missing");
  } finally {
    cleanup(root);
  }
});

test("防御：docs/skills 是文件（非目录）→ 空串＋skills-root-unreadable 诊断；控制字符目录名 → 该条跳过（name-invalid），注入文本不被破坏", () => {
  const root = makeRoot();
  try {
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "skills"), "这是文件不是目录\n");
    const skips1: InstalledSkillsDiagnostic[] = [];
    assert.equal(renderInstalledSkillsSection(root, "A", (d) => skips1.push(d)), "", "根不可读 ⇒ 零渲染");
    assert.equal(skips1.length, 1);
    assert.equal(skips1[0]!.reason, "skills-root-unreadable");

    fs.rmSync(path.join(root, "docs", "skills"));
    let created = false;
    try {
      fs.mkdirSync(path.join(root, "docs", "skills", "bad\nname"), { recursive: true });
      created = true;
    } catch {
      created = false; // 文件系统不支持控制字符目录名——跳过本段（不虚报）
    }
    if (created) {
      fs.writeFileSync(path.join(root, "docs", "skills", "bad\nname", "install.md"), registrationText("bad\nname", { roles: "A" }));
      fs.writeFileSync(path.join(root, "docs", "skills", "bad\nname", "SKILL.md"), "内容");
      const skips2: InstalledSkillsDiagnostic[] = [];
      assert.equal(renderInstalledSkillsSection(root, "A", (d) => skips2.push(d)), "", "名非法 ⇒ 该条跳过");
      assert.equal(skips2.length, 1);
      assert.equal(skips2[0]!.reason, "name-invalid");
    }
  } finally {
    cleanup(root);
  }
});

// —— 登记解析宽容与首现为准 ——

test("登记解析宽容：BOM/CRLF/半角冒号/无前缀横线均可；重复字段首现为准；无关行忽略", () => {
  const root = makeRoot();
  try {
    const registration = "\uFEFF# 安装登记：tol\r\n用途: 宽容用途\r\n- 适用角色：A\r\n- 状态：uninstalled\r\n- 状态：installed\r\n随便一行：不是字段\r\n- 安装日期: 2026-10-15\r\n";
    writeSkill(root, "tol", registration, "宽容内容");
    assert.equal(
      renderInstalledSkillsSection(root, "A"),
      "",
      "重复「状态」首现为准＝uninstalled ⇒ 按停用跳过（不猜后写值）",
    );
    writeSkill(root, "tol2", registration.replace("- 状态：uninstalled\r\n", ""), "宽容内容");
    // 上面 replace 后首现 status ＝ installed（第 2 次出现）——该条应正常注入，且日期/用途经历宽容解析。
    const text = renderInstalledSkillsSection(root, "A");
    assert.equal(
      text,
      [HEADER, `1. docs/skills/tol2/SKILL.md（用途：宽容用途；sha256:${sha("宽容内容")}；安装于 2026-10-15）`, FOOTER].join("\n"),
      "BOM/CRLF/半角冒号/无横线行均可解析；日期逐字（无后缀）",
    );
  } finally {
    cleanup(root);
  }
});

// —— 诊断面：内部记录与可选回调 ——

test("坏件写内部诊断：configureDiagnostics 后落 jsonl（event=installed-skills.skip；含 path/reasonCode/roleId）", async () => {
  const root = makeRoot();
  const diagDir = fs.mkdtempSync(path.join(os.tmpdir(), "ans-installed-skills-diag-"));
  try {
    configureDiagnostics({ directory: diagDir });
    fs.mkdirSync(path.join(root, "docs", "skills", "no-reg"), { recursive: true });
    assert.equal(renderInstalledSkillsSection(root, "A"), "");
    await flushDiagnostics();
    const files = fs.readdirSync(diagDir).filter((f) => f.startsWith("ans-diagnostics-"));
    assert.equal(files.length, 1, "当日 jsonl 已写出");
    const rows = fs.readFileSync(path.join(diagDir, files[0]!), "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    const skip = rows.find((r) => r["event"] === "installed-skills.skip");
    assert.ok(skip, "坏件应有 installed-skills.skip 记录");
    assert.equal(skip["component"], "orchestration.installed-skills");
    assert.equal(skip["roleId"], "A");
    assert.equal(skip["path"], "docs/skills/no-reg/install.md");
    assert.equal(skip["reasonCode"], "registration-missing");
  } finally {
    await disposeDiagnostics();
    cleanup(root, diagDir);
  }
});

test("可选回调：坏件逐条如实；无坏件不触发；回调抛错被吞（不影响注入与会话）", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "good", registrationText("good", { roles: "A" }), "内容");
    const none: InstalledSkillsDiagnostic[] = [];
    assert.ok(renderInstalledSkillsSection(root, "A", (d) => none.push(d)) !== "", "好件正常渲染");
    assert.deepEqual(none, [], "无坏件 → 回调不触发");

    writeSkill(root, "no-reg");
    const text = renderInstalledSkillsSection(root, "A", () => {
      throw new Error("观察面回调的错");
    });
    assert.ok(text.includes("docs/skills/good/SKILL.md"), "回调抛错被吞：好件注入不受影响、函数不抛错");
  } finally {
    cleanup(root);
  }
});

// —— I3 前置（PM 小扩展）：readSkillRegistration——登记读取公开视图，与渲染器共用判据 ——

test("readSkillRegistration：命中登记 → 公开视图四字段（分词/日期口径同解析器；uninstalled 原样返回——状态判读归调用方）", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "alpha", registrationText("alpha", {
      purpose: "读用途",
      roles: "A、`B`，C",
      date: "2026-10-16（按客户指令）",
    }), "内容");
    assert.deepEqual(readSkillRegistration(root, "alpha"), {
      purpose: "读用途",
      roles: ["A", "B", "C"],
      status: "installed",
      date: "2026-10-16",
    }, "返回面＝parseRegistration 公开视图（角色已分词去包裹；日期取 ISO 片段）");
    // 读取器与查看者角色无关：别角色登记同样可读（角色判读归调用方——handler 判「含/不含角色」）。
    writeSkill(root, "off", registrationText("off", { roles: "A", status: "uninstalled" }), "内容");
    assert.deepEqual(readSkillRegistration(root, "off"), {
      purpose: "示例用途",
      roles: ["A"],
      status: "uninstalled",
      date: "2026-10-16",
    }, "uninstalled 是已知态、不是坏件：原样返回（handler 卸载校验面）");
  } finally {
    cleanup(root);
  }
});

test("readSkillRegistration：坏件/缺失 ⇒ undefined（名非法/登记缺失/字段缺失/状态未知/EISDIR/空入口/含分隔符防御）", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "no-reg"); // 登记缺失
    writeSkill(root, "no-date", registrationText("no-date", { roles: "A", date: undefined }), "内容"); // 字段缺失
    writeSkill(root, "typo", registrationText("typo", { roles: "A", status: "instaled" }), "内容"); // 状态值未知
    writeSkill(root, "dir-reg", registrationText("dir-reg", { roles: "A" }));
    fs.rmSync(path.join(root, "docs", "skills", "dir-reg", "install.md"));
    fs.mkdirSync(path.join(root, "docs", "skills", "dir-reg", "install.md")); // 登记是目录（EISDIR）
    assert.equal(readSkillRegistration(root, "no-reg"), undefined, "登记缺失 ⇒ undefined");
    assert.equal(readSkillRegistration(root, "no-date"), undefined, "字段缺失 ⇒ undefined");
    assert.equal(readSkillRegistration(root, "typo"), undefined, "未知状态值 ⇒ undefined（判据同渲染器坏件）");
    assert.equal(readSkillRegistration(root, "dir-reg"), undefined, "登记不可读（EISDIR）⇒ undefined");
    assert.equal(readSkillRegistration(root, "never-existed"), undefined, "目录/登记都不存在 ⇒ undefined");
    assert.equal(readSkillRegistration(root, ""), undefined, "空名 ⇒ undefined");
    assert.equal(readSkillRegistration("", "alpha"), undefined, "空 projectRoot ⇒ undefined");
    assert.equal(readSkillRegistration("   ", "alpha"), undefined, "空白 projectRoot ⇒ undefined");
    assert.equal(readSkillRegistration(root, "a/../b"), undefined, "含 `/` ⇒ undefined（工具入参防穿越）");
    assert.equal(readSkillRegistration(root, ".."), undefined, "`..` ⇒ undefined");
    let created = false;
    try {
      fs.mkdirSync(path.join(root, "docs", "skills", "bad\nname"), { recursive: true });
      created = true;
    } catch { created = false; }
    if (created) {
      fs.writeFileSync(path.join(root, "docs", "skills", "bad\nname", "install.md"), registrationText("bad\nname", { roles: "A" }));
      assert.equal(readSkillRegistration(root, "bad\nname"), undefined, "名含控制字符 ⇒ undefined（同渲染器 name-invalid）");
    }
  } finally {
    cleanup(root);
  }
});

test("readSkillRegistration 与渲染器同判据（同夹具双向核）：坏件 undefined ⟺ 渲染器诊断跳过；uninstalled/别角色返回视图 ⟺ 渲染器静默过滤", () => {
  const root = makeRoot();
  try {
    writeSkill(root, "good", registrationText("good", { purpose: "好件", roles: "A" }), "内容");
    writeSkill(root, "off", registrationText("off", { roles: "A", status: "uninstalled" }), "内容");
    writeSkill(root, "for-b", registrationText("for-b", { roles: "B" }), "内容");
    writeSkill(root, "no-reg");
    writeSkill(root, "no-status", registrationText("no-status", { roles: "A", status: undefined }), "内容");
    const skips: InstalledSkillsDiagnostic[] = [];
    const text = renderInstalledSkillsSection(root, "A", (d) => skips.push(d));
    // 坏件侧：读取器 undefined ⟺ 渲染器「坏件跳过＋诊断」（path/reason 对齐——同一判据来源）。
    assert.equal(readSkillRegistration(root, "no-reg"), undefined);
    assert.equal(readSkillRegistration(root, "no-status"), undefined);
    assert.deepEqual(
      skips.map((d) => [d.path, d.reason]),
      [
        ["docs/skills/no-reg/install.md", "registration-missing"],
        ["docs/skills/no-status/install.md", "registration-parse-failed"],
      ],
      "坏件集＝渲染器诊断集（扫描序：no-reg < no-status）——逐字同口径",
    );
    // 非坏件侧：读取器有视图、渲染器按角色/状态静默过滤（无诊断）。
    assert.notEqual(readSkillRegistration(root, "off"), undefined, "uninstalled：读取器返回视图");
    assert.notEqual(readSkillRegistration(root, "for-b"), undefined, "别角色：读取器返回视图（角色判读归调用方）");
    assert.ok(text.includes("docs/skills/good/SKILL.md"), "good 命中角色 → 渲染");
    assert.equal(text.includes("off/SKILL.md"), false, "uninstalled → 渲染器不注入");
    assert.equal(text.includes("for-b/SKILL.md"), false, "别角色 → 渲染器不注入");
  } finally {
    cleanup(root);
  }
});

// —— G-4 能力位接线（I1/I2 工具末环；openRoleSession 只给 su 透传） ——
// 夹具与桩沿 test/编排/watchdog.test.ts（G-2 同族先例）：桩捕获能力面 + 真实 Service 装配的端到端。

/** G-4 接线夹具：项目角色 X + builtInRoles 声明 su（同 watchdog.test.ts 先例）。 */
function makeWiringProject(): ProjectConfig {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ans-installed-skills-wire-"));
  const dir = path.join(root, "角色卡", "X");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "role-card.md"), "# 角色 X\n");
  fs.writeFileSync(
    path.join(dir, "boundary.yaml"),
    "role: X\nentries:\n  - kind: file\n    path: src/thing.ts\n    purpose: 测试条目\n",
  );
  return {
    projectRoot: root,
    skillRoot: root,
    roles: { X: { card: "角色卡/X/role-card.md", boundary: "角色卡/X/boundary.yaml" } },
    builtInRoles: ["su"],
    governanceBoundary: { path: "角色卡/X/boundary.yaml", acceptance: { accepted: true, source: "test:fixture" } },
  };
}

/** 桩适配器：捕获编排交来的能力面（只断言注入与否/同引用，不跑会话）。 */
function stubAdapter(): {
  createAdapter: (gate: WriteGate, capabilities?: AdapterCapabilities) => RuntimeAdapter;
  caps: () => AdapterCapabilities | undefined;
} {
  let captured: AdapterCapabilities | undefined;
  return {
    caps: () => captured,
    createAdapter: (_gate, capabilities) => {
      captured = capabilities;
      return {
        async composeContext() {
          return { systemPrompt: "" };
        },
        async bindRole(): Promise<RoleSession> {
          return {
            async prompt(): Promise<void> {},
            events(): AsyncIterable<SessionEvent> {
              return (async function* () {
                yield { kind: "settled", summary: "会话结束" } as SessionEvent;
              })();
            },
            async dispose(): Promise<void> {},
          };
        },
      };
    },
  };
}

/** 事件队列（沿 test/编排/runtime-orchestration.test.ts 先例）。 */
function queue() {
  const pending: SessionEvent[] = [];
  let waiter: (() => void) | undefined;
  let closed = false;
  return {
    push(event: SessionEvent) { pending.push(event); waiter?.(); waiter = undefined; },
    close() { closed = true; waiter?.(); waiter = undefined; },
    async *events() {
      while (true) {
        if (pending.length) { yield pending.shift()!; continue; }
        if (closed) return;
        await new Promise<void>((resolve) => { waiter = resolve; });
      }
    },
  };
}

/** 假外部引擎（真实 Service 装配；同 watchdog.test.ts 先例）。 */
function fakeProvider(
  work: (options: RuntimeProviderOptions, text: string, signal: AbortSignal) => Promise<void> = async () => {},
): { factory: RuntimeProviderFactory; calls: RuntimeProviderOptions[] } {
  const calls: RuntimeProviderOptions[] = [];
  const factory: RuntimeProviderFactory = (options) => {
    calls.push(options);
    assert.equal(options.toolDisplayMode, "required-v1");
    options.registerToolDisplayProfile!({ credentials: [] });
    return {
      async composeContext() { return { systemPrompt: "" }; },
      async bindRole() {
        const events = queue();
        let controller = new AbortController();
        return {
          runtime: options.runtime,
          get contextSource() { return "in-memory" as const; },
          get nativeSessionId() { return undefined; },
          get contextWarning() { return undefined; },
          async prompt(text: string) {
            controller = new AbortController();
            await work(options, text, controller.signal);
            events.push({ kind: "settled", summary: "engine settled", turnId: options.currentTurnId(), detail: { outcome: "completed" } });
          },
          events: () => events.events(),
          async abort() { controller.abort(); },
          async dispose() { controller.abort(); events.close(); },
        };
      },
    } satisfies RuntimeAdapter;
  };
  return { factory, calls };
}

async function callTool(options: RuntimeProviderOptions, name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> {
  const tool = options.tools.find((item) => item.name === name);
  assert.ok(tool, `已注册工具 ${name}`);
  return tool.handler({ name, args, toolCallId: name, signal });
}

test("openRoleSession（G-4）：installSkill / uninstallSkill **只给治理角色 su** 透传；项目角色不给；未给不注入", async () => {
  const project = makeWiringProject();
  try {
    const installSkill: InstallSkillFn = async () => ({
      ok: true, action: "installed", roleId: "X", name: "s1",
      path: "docs/skills/s1/SKILL.md", digest: "d".repeat(64), effective: "rebuilt",
    });
    const uninstallSkill: UninstallSkillFn = async () => ({
      ok: false, reason: "registration-unchanged", message: "登记仍含角色「X」——先改登记再卸载",
    });

    // su 会话 → 两能力原引用透传（工具据此注册）。
    const suStub = stubAdapter();
    const suHandle = await openRoleSession(
      { roleId: "su", project, installSkill, uninstallSkill },
      { createAdapter: suStub.createAdapter },
    );
    assert.equal(suStub.caps()?.installSkill, installSkill, "su 会话应拿到 installSkill 能力（同引用）");
    assert.equal(suStub.caps()?.uninstallSkill, uninstallSkill, "su 会话应拿到 uninstallSkill 能力（同引用）");
    await suHandle.dispose();

    // 项目角色会话（即便调用方误给）→ 一律不注入（两工具不注册——project 角色零感知）。
    const xStub = stubAdapter();
    const xHandle = await openRoleSession(
      { roleId: "X", project, installSkill, uninstallSkill },
      { createAdapter: xStub.createAdapter },
    );
    assert.equal(xStub.caps()?.installSkill, undefined, "项目角色会话不得注入 installSkill（只给 su）");
    assert.equal(xStub.caps()?.uninstallSkill, undefined, "项目角色会话不得注入 uninstallSkill（只给 su）");
    await xHandle.dispose();

    // su 会话未给能力（CLI 一次性前端等）→ 不注入（能力缺席 = fail-closed，工具不注册）。
    const bareStub = stubAdapter();
    const bareHandle = await openRoleSession({ roleId: "su", project }, { createAdapter: bareStub.createAdapter });
    assert.equal(bareStub.caps()?.installSkill, undefined, "未给能力 → 不注入");
    assert.equal(bareStub.caps()?.uninstallSkill, undefined, "未给能力 → 不注入");
    await bareHandle.dispose();
  } finally {
    cleanup(project.projectRoot);
  }
});

test("端到端（G-4）：su 会话经真实装配注册两工具且 handler 直达注入实现；不注入/项目角色 ⇒ 零注册", async () => {
  const project = makeWiringProject();
  const calls: InstallSkillPayload[] = [];
  const installSkill: InstallSkillFn = async (payload) => {
    calls.push(payload);
    return {
      ok: true, action: "installed", roleId: payload.roleId, name: payload.name,
      path: `docs/skills/${payload.name}/SKILL.md`, digest: "a".repeat(64), effective: "rebuilt",
    };
  };
  const uninstallSkill: UninstallSkillFn = async (payload) => {
    calls.push(payload);
    return { ok: false, reason: "registration-unchanged", message: `登记仍含角色「${payload.roleId}」——先改登记再卸载` };
  };

  const results: ToolResult[] = [];
  const suProvider = fakeProvider(async (options, _text, signal) => {
    results.push(await callTool(options, "install_skill", { roleId: "X", name: "s1" }, signal));
    results.push(await callTool(options, "uninstall_skill", { roleId: "X", name: "s1" }, signal));
  });
  const bareSuProvider = fakeProvider();
  const xProvider = fakeProvider();
  const runtimeOptions = { providerFactories: { demo: suProvider.factory }, persistSession: false };
  try {
    // 注入 ⇒ 注册：su 会话两工具在场；handler 直达注入实现（载荷原样、回执如实转达）。
    const suHandle = await openRoleSession(
      { roleId: "su", project, runtime: "demo", installSkill, uninstallSkill },
      { runtimeOptions },
    );
    await suHandle.send("给 X 装/卸技能 s1");
    for await (const ev of suHandle.events()) if (ev.kind === "settled") break;
    const suTools = suProvider.calls[0]?.tools.map((tool) => tool.name) ?? [];
    assert.ok(suTools.includes("install_skill"), "su 会话应注册 install_skill（注入才注册）");
    assert.ok(suTools.includes("uninstall_skill"), "su 会话应注册 uninstall_skill（注入才注册）");
    assert.deepEqual(calls, [{ roleId: "X", name: "s1" }, { roleId: "X", name: "s1" }], "载荷逐字（roleId/name）直达注入实现");
    assert.equal(results[0]?.ok, true, "成功回执如实（ok:true）");
    assert.ok(results[0]?.message.includes("docs/skills/s1/SKILL.md"), "回执含内容路径");
    assert.ok(results[0]?.message.includes("未改变任何角色的写边界"), "成功回执重申不改变任何写边界（安装 ≠ 授权）");
    assert.equal(results[1]?.ok, false, "「登记未撤销」回执如实（ok:false）");
    assert.ok(results[1]?.message.includes("未执行"), "未执行、零副作用如实转达（绝不说成已卸载）");
    await suHandle.dispose();

    // 不注入 ⇒ 零注册：同为 su 会话、未给两能力（能力缺席 = fail-closed）。
    const bareHandle = await openRoleSession(
      { roleId: "su", project, runtime: "demo" },
      { runtimeOptions: { providerFactories: { demo: bareSuProvider.factory }, persistSession: false } },
    );
    await bareHandle.send("普通对话");
    for await (const ev of bareHandle.events()) if (ev.kind === "settled") break;
    const bareTools = bareSuProvider.calls[0]?.tools.map((tool) => tool.name) ?? [];
    assert.ok(!bareTools.includes("install_skill") && !bareTools.includes("uninstall_skill"), "未注入 ⇒ 两工具不注册");
    await bareHandle.dispose();

    // 项目角色零感知：即便误给两能力也不注册（只 su）。
    const xHandle = await openRoleSession(
      { roleId: "X", project, runtime: "demo", installSkill, uninstallSkill },
      { runtimeOptions: { providerFactories: { demo: xProvider.factory }, persistSession: false } },
    );
    await xHandle.send("普通干活");
    for await (const ev of xHandle.events()) if (ev.kind === "settled") break;
    const xTools = xProvider.calls[0]?.tools.map((tool) => tool.name) ?? [];
    assert.ok(!xTools.includes("install_skill") && !xTools.includes("uninstall_skill"), "项目角色会话不得注册两工具（只给 su）");
    await xHandle.dispose();
  } finally {
    cleanup(project.projectRoot);
  }
});

// —— G-4 V2 MCP 能力位接线（install_mcp/uninstall_mcp 末环；同链同桩——夹具/桩复用上组） ——

test("openRoleSession（G-4 V2）：installMcp / uninstallMcp **只给治理角色 su** 透传；项目角色不给；未给不注入", async () => {
  const project = makeWiringProject();
  try {
    const installMcp: InstallMcpFn = async () => ({
      ok: true, action: "installed", roleId: "X", name: "echo",
      path: "docs/mcp/echo.md", digest: "e".repeat(64), effective: "rebuilt",
    });
    const uninstallMcp: UninstallMcpFn = async () => ({
      ok: false, reason: "registration-unchanged", message: "声明仍含角色「X」——先改声明再卸载",
    });

    // su 会话 → 两能力原引用透传（工具据此注册）。
    const suStub = stubAdapter();
    const suHandle = await openRoleSession(
      { roleId: "su", project, installMcp, uninstallMcp },
      { createAdapter: suStub.createAdapter },
    );
    assert.equal(suStub.caps()?.installMcp, installMcp, "su 会话应拿到 installMcp 能力（同引用）");
    assert.equal(suStub.caps()?.uninstallMcp, uninstallMcp, "su 会话应拿到 uninstallMcp 能力（同引用）");
    await suHandle.dispose();

    // 项目角色会话（即便调用方误给）→ 一律不注入（两工具不注册——project 角色零感知）。
    const xStub = stubAdapter();
    const xHandle = await openRoleSession(
      { roleId: "X", project, installMcp, uninstallMcp },
      { createAdapter: xStub.createAdapter },
    );
    assert.equal(xStub.caps()?.installMcp, undefined, "项目角色会话不得注入 installMcp（只给 su）");
    assert.equal(xStub.caps()?.uninstallMcp, undefined, "项目角色会话不得注入 uninstallMcp（只给 su）");
    await xHandle.dispose();

    // su 会话未给能力（CLI 一次性前端等）→ 不注入（能力缺席 = fail-closed，工具不注册）。
    const bareStub = stubAdapter();
    const bareHandle = await openRoleSession({ roleId: "su", project }, { createAdapter: bareStub.createAdapter });
    assert.equal(bareStub.caps()?.installMcp, undefined, "未给能力 → 不注入");
    assert.equal(bareStub.caps()?.uninstallMcp, undefined, "未给能力 → 不注入");
    await bareHandle.dispose();
  } finally {
    cleanup(project.projectRoot);
  }
});

test("端到端（G-4 V2）：su 会话经真实装配注册两工具且 handler 直达注入实现；不注入/项目角色 ⇒ 零注册", async () => {
  const project = makeWiringProject();
  const calls: InstallMcpPayload[] = [];
  const installMcp: InstallMcpFn = async (payload) => {
    calls.push(payload);
    return {
      ok: true, action: "installed", roleId: payload.roleId, name: payload.name,
      path: `docs/mcp/${payload.name}.md`, digest: "b".repeat(64), effective: "rebuilt",
    };
  };
  const uninstallMcp: UninstallMcpFn = async (payload) => {
    calls.push(payload);
    return { ok: false, reason: "registration-unchanged", message: `声明仍含角色「${payload.roleId}」——先改声明再卸载` };
  };

  const results: ToolResult[] = [];
  const suProvider = fakeProvider(async (options, _text, signal) => {
    results.push(await callTool(options, "install_mcp", { roleId: "X", name: "echo" }, signal));
    results.push(await callTool(options, "uninstall_mcp", { roleId: "X", name: "echo" }, signal));
  });
  const bareSuProvider = fakeProvider();
  const xProvider = fakeProvider();
  const runtimeOptions = { providerFactories: { demo: suProvider.factory }, persistSession: false };
  try {
    // 注入 ⇒ 注册：su 会话两工具在场；handler 直达注入实现（载荷原样、回执如实转达）。
    const suHandle = await openRoleSession(
      { roleId: "su", project, runtime: "demo", installMcp, uninstallMcp },
      { runtimeOptions },
    );
    await suHandle.send("给 X 装/卸 MCP echo");
    for await (const ev of suHandle.events()) if (ev.kind === "settled") break;
    const suTools = suProvider.calls[0]?.tools.map((tool) => tool.name) ?? [];
    assert.ok(suTools.includes("install_mcp"), "su 会话应注册 install_mcp（注入才注册）");
    assert.ok(suTools.includes("uninstall_mcp"), "su 会话应注册 uninstall_mcp（注入才注册）");
    assert.deepEqual(calls, [{ roleId: "X", name: "echo" }, { roleId: "X", name: "echo" }], "载荷逐字（roleId/name）直达注入实现");
    assert.equal(results[0]?.ok, true, "成功回执如实（ok:true）");
    assert.ok(results[0]?.message.includes("docs/mcp/echo.md"), "回执含声明文件路径");
    assert.ok(results[0]?.message.includes("未改变任何角色的写边界"), "成功回执重申不改变任何写边界（安装 ≠ 授权）");
    assert.ok(results[0]?.message.includes("能力级授予"), "回执点名能力级授予（诚实面：不得宣称逐调用受审）");
    assert.equal(results[1]?.ok, false, "「声明未撤销」回执如实（ok:false）");
    assert.ok(results[1]?.message.includes("未执行"), "未执行、零副作用如实转达（绝不说成已卸载）");
    await suHandle.dispose();

    // 不注入 ⇒ 零注册：同为 su 会话、未给两能力（能力缺席 = fail-closed）。
    const bareHandle = await openRoleSession(
      { roleId: "su", project, runtime: "demo" },
      { runtimeOptions: { providerFactories: { demo: bareSuProvider.factory }, persistSession: false } },
    );
    await bareHandle.send("普通对话");
    for await (const ev of bareHandle.events()) if (ev.kind === "settled") break;
    const bareTools = bareSuProvider.calls[0]?.tools.map((tool) => tool.name) ?? [];
    assert.ok(!bareTools.includes("install_mcp") && !bareTools.includes("uninstall_mcp"), "未注入 ⇒ 两工具不注册");
    await bareHandle.dispose();

    // 项目角色零感知：即便误给两能力也不注册（只 su）。
    const xHandle = await openRoleSession(
      { roleId: "X", project, runtime: "demo", installMcp, uninstallMcp },
      { runtimeOptions: { providerFactories: { demo: xProvider.factory }, persistSession: false } },
    );
    await xHandle.send("普通干活");
    for await (const ev of xHandle.events()) if (ev.kind === "settled") break;
    const xTools = xProvider.calls[0]?.tools.map((tool) => tool.name) ?? [];
    assert.ok(!xTools.includes("install_mcp") && !xTools.includes("uninstall_mcp"), "项目角色会话不得注册两工具（只给 su）");
    await xHandle.dispose();
  } finally {
    cleanup(project.projectRoot);
  }
});
