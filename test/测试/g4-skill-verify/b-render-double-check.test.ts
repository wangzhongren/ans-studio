// test/测试/g4-skill-verify/b-render-double-check.test.ts —— G-4 独立验证 B 域：**渲染单一来源**。
//
// 对抗性独立构造：自建夹具表逐目录钉「读取器视图 ⟺ 渲染器行为」双向一致；digest 独立复算
// （含 BOM/非法 UTF-8 原始字节对抗）；坏件防御（缺件/解析失败/未知状态/控制字符名/穿越名）；
// 零技能 ∅；多技能排序编号；onDiagnostic 回调抛错被吞、绝不抛。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import { readSkillRegistration, renderInstalledSkillsSection } from "../../../src/common/编排/installed-skills.ts";
import type { InstalledSkillsDiagnostic } from "../../../src/common/编排/installed-skills.ts";

const HEADER = "## 本角色已安装技能（动手前先读，按序）";
const FOOTER = "内容以文件当刻字节为准；读到与派发描述/版本不符 ⇒ 停止并交 blocked 报告（不得猜）。";
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

function temp(run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g4-render-"));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function putSkill(root: string, name: string, opts: { install?: string; content?: Buffer; noContent?: boolean } = {}): void {
  const dir = path.join(root, "docs", "skills", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "install.md"), opts.install ?? [
    `# 安装登记：${name}`,
    "",
    "- 用途：一句话用途",
    "- 适用角色：X",
    "- 状态：installed",
    "- 安装日期：2026-10-16",
    "",
  ].join("\n"));
  if (opts.noContent !== true) fs.writeFileSync(path.join(dir, "SKILL.md"), opts.content ?? Buffer.from(`# 技能：${name}\n`, "utf8"));
}

// —————————————————————— 金文本与 digest 独立复算 ——————————————————————

test("金文本独立构造：双技能按 name 排序编号 1/2；digest＝当刻字节 sha256 独立复算；日期取 ISO 段", () => {
  temp((root) => {
    putSkill(root, "中-技能2", {
      install: ["# 安装登记", "- 用途：第二技能", "- 适用角色：`X`，Y", "- 状态：installed", "- 安装日期：2026-10-16（按客户指令）", ""].join("\n"),
      content: Buffer.from("# 技能2\n正文二\n", "utf8"),
    });
    putSkill(root, "A技能1", {
      install: ["# 安装登记", "- 用途：第一技能", "- 适用角色：X", "- 状态：installed", "- 安装日期：2026-10-16", ""].join("\n"),
      content: Buffer.from("# 技能1\n正文一\n", "utf8"),
    });
    const text = renderInstalledSkillsSection(root, "X");
    const expectedLine1 = `1. docs/skills/A技能1/SKILL.md（用途：第一技能；sha256:${sha(Buffer.from("# 技能1\n正文一\n", "utf8"))}；安装于 2026-10-16）`;
    const expectedLine2 = `2. docs/skills/中-技能2/SKILL.md（用途：第二技能；sha256:${sha(Buffer.from("# 技能2\n正文二\n", "utf8"))}；安装于 2026-10-16）`;
    assert.equal(text, [HEADER, expectedLine1, expectedLine2, FOOTER].join("\n"), "金文本逐字（含排序与编号）");
  });
});

test("digest 原始字节对抗：BOM＋非法 UTF-8 字节的 SKILL.md——sha256 按原始字节算（不解码/不剥 BOM）", () => {
  temp((root) => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from([0x41, 0xff, 0xfe, 0x42])]);
    putSkill(root, "raw", { content: bytes });
    const text = renderInstalledSkillsSection(root, "X");
    assert.ok(text.includes(`sha256:${sha(bytes)}`), "digest＝原始字节 sha256");
    const stripped = Buffer.concat([Buffer.from([0x41, 0xff, 0xfe, 0x42])]);
    assert.equal(text.includes(`sha256:${sha(stripped)}`), false, "digest 不得等于剥 BOM 后的哈希（不剥 BOM）");
    assert.ok(text.includes(`sha256:${sha(Buffer.from(bytes.toString("utf8"), "utf8"))}`) === false, "digest 不得等于经解码再编码的哈希（不经 UTF-8 解码）");
  });
});

// —————————————————————— 同夹具双向核（读取器 ⟺ 渲染器） ——————————————————————

test("双向核（自建逐目录表）：登记级坏件集＝读取器 undefined 集＝渲染器诊断集；非坏件原样返回视图", () => {
  temp((root) => {
    // 好件
    putSkill(root, "good", { content: Buffer.from("good\n", "utf8") });
    // 登记级坏件四种
    fs.mkdirSync(path.join(root, "docs", "skills", "no-reg"), { recursive: true });
    putSkill(root, "bad-fields", { install: "# 缺字段\n- 用途：只有用途\n" });
    putSkill(root, "bad-status", { install: ["- 用途：p", "- 适用角色：X", "- 状态：paused", "- 安装日期：2026-10-16"].join("\n") });
    putSkill(root, "ctl\u0001name", {});
    // 非坏件两种：uninstalled / 别角色
    putSkill(root, "off", { install: ["- 用途：p", "- 适用角色：X", "- 状态：uninstalled", "- 安装日期：2026-10-16"].join("\n") });
    putSkill(root, "for-b", { install: ["- 用途：p", "- 适用角色：B", "- 状态：installed", "- 安装日期：2026-10-16"].join("\n") });
    // 内容件缺失（渲染面额外坏件——读取器不看 SKILL.md）
    putSkill(root, "no-content", { noContent: true });

    const diags: InstalledSkillsDiagnostic[] = [];
    const text = renderInstalledSkillsSection(root, "X", (d) => diags.push(d));

    const badNames = ["bad-fields", "bad-status", "ctl\u0001name", "no-reg"];
    for (const name of badNames) {
      assert.equal(readSkillRegistration(root, name), undefined, `${name}：读取器应 undefined（登记级坏件）`);
    }
    assert.deepEqual(
      diags.map((d) => [d.path, d.reason]).sort(),
      [
        ["docs/skills/bad-fields/install.md", "registration-parse-failed"],
        ["docs/skills/bad-status/install.md", "registration-parse-failed"],
        ["docs/skills/ctl\u0001name/install.md", "name-invalid"],
        ["docs/skills/no-content/SKILL.md", "skill-file-missing"],
        ["docs/skills/no-reg/install.md", "registration-missing"],
      ].sort(),
      "渲染器诊断集＝登记级坏件集＋内容件缺失（逐条同口径）",
    );

    // 非坏件：读取器返回视图（判读归调用方）；渲染器静默过滤（无诊断）。
    assert.notEqual(readSkillRegistration(root, "off"), undefined, "uninstalled：读取器原样返回视图");
    assert.notEqual(readSkillRegistration(root, "for-b"), undefined, "别角色：读取器原样返回视图");
    assert.equal(diags.some((d) => d.path.includes("off/") || d.path.includes("for-b/")), false, "uninstalled/别角色 ⇒ 渲染器静默过滤零诊断");

    // 内容件缺失：读取器有视图（登记坏件判据不含 SKILL.md）；渲染器跳过＋skill-file-missing 诊断。
    assert.notEqual(readSkillRegistration(root, "no-content"), undefined, "读取器不检查 SKILL.md");
    assert.deepEqual(
      diags.filter((d) => d.path.startsWith("docs/skills/no-content/")).map((d) => [d.path, d.reason]),
      [["docs/skills/no-content/SKILL.md", "skill-file-missing"]],
    );

    // 渲染面：仅 good 命中。
    assert.equal(text.includes("docs/skills/good/SKILL.md"), true, "好件照常渲染");
    assert.equal(text.includes("no-content/SKILL.md"), false);
    assert.equal(text.includes("off/SKILL.md"), false);
    assert.equal(text.includes("for-b/SKILL.md"), false);
    assert.equal(text.split("\n").length, 3, "恰 3 行（头＋1 条＋尾）");
  });
});

test("坏件集对抗矩阵（逐条 reason 与 detail 如实）＋ onDiagnostic 抛错被吞、默认两参调用绝不抛", () => {
  temp((root) => {
    fs.mkdirSync(path.join(root, "docs", "skills", "bad-status"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "skills", "bad-status", "install.md"), ["- 用途：p", "- 适用角色：X", "- 状态：paused", "- 安装日期：2026-10-16"].join("\n"));
    const diags: InstalledSkillsDiagnostic[] = [];
    renderInstalledSkillsSection(root, "X", (d) => { diags.push(d); throw new Error("观察者自己炸了"); });
    assert.equal(diags.length, 1);
    assert.equal(diags[0]!.reason, "registration-parse-failed");
    assert.ok(diags[0]!.detail?.includes("未知状态值：paused"), "未知状态值 detail 如实点名");
    // 默认两参（无回调）照常返回
    assert.equal(renderInstalledSkillsSection(root, "X"), "");
  });
  // docs/skills 是文件（非目录）：空串＋skills-root-unreadable（不抛）
  temp((root) => {
    fs.mkdirSync(path.join(root, "docs"), { recursive: true });
    fs.writeFileSync(path.join(root, "docs", "skills"), "我是文件不是目录");
    const diags: InstalledSkillsDiagnostic[] = [];
    assert.equal(renderInstalledSkillsSection(root, "X", (d) => diags.push(d)), "");
    assert.deepEqual(diags.map((d) => [d.path, d.reason]), [["docs/skills", "skills-root-unreadable"]]);
  });
  // 空 projectRoot / 空白：空串零诊断（不触盘）
  for (const bad of ["", "   ", undefined as unknown as string]) {
    const diags: InstalledSkillsDiagnostic[] = [];
    assert.equal(renderInstalledSkillsSection(bad, "X", (d) => diags.push(d)), "");
    assert.equal(diags.length, 0);
  }
});

// —————————————————————— 零技能 ∅ 与文件条目 ——————————————————————

test("零技能 ∅：无目录/空目录/仅有直接文件条目——全部空串零诊断；文件条目不是技能", () => {
  temp((root) => {
    assert.equal(renderInstalledSkillsSection(root, "X"), "", "无 docs/skills 目录 ⇒ 空串");
    fs.mkdirSync(path.join(root, "docs", "skills"), { recursive: true });
    assert.equal(renderInstalledSkillsSection(root, "X"), "", "空目录 ⇒ 空串");
    fs.writeFileSync(path.join(root, "docs", "skills", "README.md"), "直接放的文件");
    const diags: InstalledSkillsDiagnostic[] = [];
    assert.equal(renderInstalledSkillsSection(root, "X", (d) => diags.push(d)), "", "仅文件条目 ⇒ 空串");
    assert.equal(diags.length, 0, "文件条目不算坏件（无诊断）");
  });
});

// —————————————————————— 读取器入参防御（穿越/非法名） ——————————————————————

test("读取器入参防御（对抗）：穿越名/分隔符/控制字符/空白根——一律 undefined，绝不抛", () => {
  temp((root) => {
    putSkill(root, "ok", {});
    for (const bad of ["..", "../ok", "a/b", "a\\b", ".", "", "/etc/passwd", "x/../../y", "\u0000", "nul\u0007name"]) {
      assert.equal(readSkillRegistration(root, bad), undefined, `名「${JSON.stringify(bad)}」⇒ undefined`);
    }
    for (const badRoot of ["", "   ", "./\u0000"]) {
      assert.equal(readSkillRegistration(badRoot, "ok"), undefined, `根「${JSON.stringify(badRoot)}」⇒ undefined`);
    }
    assert.notEqual(readSkillRegistration(root, "ok"), undefined, "正常名正常根 ⇒ 视图");
    // 符号链接穿越对抗：docs/skills/link → 库外目录（读取器按名读 install.md；链接目录能读则读——本仓无删除/写面，
    // 读取器只读不写，此项仅核对不抛错）。
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "g4-outside-"));
    try {
      fs.writeFileSync(path.join(outside, "install.md"), ["- 用途：outside", "- 适用角色：X", "- 状态：installed", "- 安装日期：2026-10-16"].join("\n"));
      fs.symlinkSync(outside, path.join(root, "docs", "skills", "link"));
      const v = readSkillRegistration(root, "link");
      assert.ok(v === undefined || typeof v.purpose === "string", "链接条目：只读返回或 undefined，绝不抛");
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

// —————————————————————— 解析宽容性（对抗变体） ——————————————————————

test("解析宽容但有界（对抗变体）：全角/半角冒号、无横线、BOM、CRLF 均可；缺任一字段即坏件；同键首现为准", () => {
  temp((root) => {
    putSkill(root, "lenient", {
      install: "﻿# 登记\r\n用途：CRLF 全角冒号\r\n* 适用角色：X\r\n状态: installed\r\n安装日期：2026-10-16\r\n无关行忽略\r\n",
      content: Buffer.from("lenient\n", "utf8"),
    });
    putSkill(root, "first-wins", {
      install: ["- 用途：首现", "- 用途：后现", "- 适用角色：X", "- 状态：installed", "- 安装日期：2026-10-16"].join("\n"),
    });
    putSkill(root, "missing-date", { install: ["- 用途：p", "- 适用角色：X", "- 状态：installed"].join("\n") });
    const text = renderInstalledSkillsSection(root, "X");
    assert.ok(text.includes("用途：CRLF 全角冒号") && text.includes("安装于 2026-10-16"), "宽容格式照常解析");
    assert.ok(text.includes("用途：首现"), "同键首现为准");
    assert.equal(text.includes("后现"), false);
    assert.equal(text.includes("missing-date/SKILL.md"), false, "缺字段 ⇒ 该条跳过");
    const v = readSkillRegistration(root, "missing-date");
    assert.equal(v, undefined);
  });
});
