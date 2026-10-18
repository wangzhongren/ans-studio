// test/测试/g5-reasoning-verify/f-settings.test.ts —— F 域：设置链（独立验证）。
//
// 验证对象：`src/common/shared/runtime-settings.ts`（三字段/choices/help 计费文案）＋
// `app/desktop/runtime-config.ts`（保存校验：choices 拒/trim 规范形/空串清除/批量原子）＋
// `app/desktop/pi-config.ts`（与注册表逐键对齐；旧面板路径无值域校验为如实现状）。
// 全部用例独立构造（批量原子拒绝/越界键面/大写字样/非串值等为实施方用例未覆盖类别）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { RUNTIME_SETTINGS, getRuntimeSettingsDefinition } from "../../../src/common/shared/runtime-settings.ts";
import { REASONING_EFFORT_ENV_KEYS, REASONING_EFFORT_VALUES } from "../../../src/common/runtime-core/reasoning.ts";
import { getRuntimeConfig, saveRuntimeConfig } from "../../../app/desktop/runtime-config.ts";
import { PI_PANEL_KEYS, getPiConfig, savePiConfig } from "../../../app/desktop/pi-config.ts";
import { readEnvFile } from "../../../src/common/shared/env-file.ts";

function tempEnv(): { envPath: string; cleanup(): void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g5-f-"));
  return { envPath: path.join(root, ".env"), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

// —————————————————————— ① 注册表三字段 / choices / help ——————————————————————

test("F1 三字段：键＝冻结 env 键逐字；label「推理强度」；可选非机密；choices 值域与冻结五值单一来源（Codex 无 off）", () => {
  const expectations: Array<{ runtime: "claude" | "codex" | "pi"; choices: string[] }> = [
    { runtime: "claude", choices: [...REASONING_EFFORT_VALUES] },
    { runtime: "codex", choices: REASONING_EFFORT_VALUES.filter((value) => value !== "off") },
    { runtime: "pi", choices: [...REASONING_EFFORT_VALUES] },
  ];
  for (const { runtime, choices } of expectations) {
    const field = getRuntimeSettingsDefinition(runtime)!.fields.find((candidate) => candidate.key === REASONING_EFFORT_ENV_KEYS[runtime]);
    assert.ok(field, `${runtime} 必有推理强度字段`);
    assert.equal(field.key, REASONING_EFFORT_ENV_KEYS[runtime], "键＝冻结 env 键（逐字）");
    assert.equal(field.label, "推理强度");
    assert.equal(field.required, false, "可选（不改 missingKeys 判据）");
    assert.equal(field.secret, false, "非机密");
    assert.deepEqual([...(field.choices ?? [])], choices, `${runtime} choices 值域＝冻结五值单一来源`);
  }
  assert.equal(REASONING_EFFORT_VALUES.includes("off"), true, "冻结值域含 off（claude/pi 全量）");
  assert.deepEqual([...(RUNTIME_SETTINGS.codex.fields.find((field) => field.key === "ANS_CODEX_REASONING_EFFORT")!.choices ?? [])], ["low", "medium", "high", "xhigh"], "Codex 无 off（平台无该档）");
});

test("F2 help 文案：三平台统一含「维持平台默认／档位梯／思考计入输出 tokens」（计费如实在位）", () => {
  const helps = new Set<string>();
  for (const runtime of ["claude", "codex", "pi"] as const) {
    const field = getRuntimeSettingsDefinition(runtime)!.fields.find((candidate) => candidate.key === REASONING_EFFORT_ENV_KEYS[runtime])!;
    assert.ok(field.help && field.help.length > 0, runtime + " help 在场");
    assert.ok(field.help!.includes("留空＝维持平台默认"), runtime + " 未设态如实");
    assert.ok(field.help!.includes("关/低/中/高/极高"), runtime + " 档位梯如实");
    assert.ok(field.help!.includes("思考计入输出 tokens"), runtime + " 计费如实");
    helps.add(field.help!);
  }
  assert.equal(helps.size, 1, "三平台 help 逐字统一（同一句）");
});

// —————————————————————— ② 保存链：choices 拒 / trim 规范形 / 空串清除 / 批量原子 ——————————————————————

test("F3 choices 拒：非法值如实拒绝、零落盘、错误不回显提交值原文、错误列出值域；值域按运行时（codex 拒 off；claude 收 off）", async () => {
  const t = tempEnv();
  try {
    fs.writeFileSync(t.envPath, "ANS_PI_MODEL=fixture-model\n");
    const before = fs.readFileSync(t.envPath, "utf8");
    const rejected = await saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_REASONING_EFFORT: "banana-等级" } }, { envPath: t.envPath });
    assert.equal(rejected.ok, false);
    assert.ok(rejected.error!.includes("推理强度取值无效"), "类别如实");
    // 2026-10-18 客户改为滑块：错误文案按既有契约优先列 `choiceLabels`（不弱化安全断言）。
    assert.ok(rejected.error!.includes("关 / 低 / 中 / 高 / 极高"), "值域如实列出友好标签（滑块档位）");
    assert.equal(rejected.error!.includes("banana"), false, "不回显提交值原文");
    assert.equal(fs.readFileSync(t.envPath, "utf8"), before, "拒绝零副作用（文件逐字未动）");
    // 值域按运行时：codex 拒 off / 收 high；claude 收 off（端点）。
    const codexOff = await saveRuntimeConfig({ runtime: "codex", updates: { ANS_CODEX_REASONING_EFFORT: "off" } }, { envPath: t.envPath });
    assert.equal(codexOff.ok, false, "codex 无 off 档");
    assert.ok(codexOff.error!.includes("低 / 中 / 高 / 极高"), "codex 值域按友好标签列出（无「关」档）");
    assert.equal(fs.readFileSync(t.envPath, "utf8"), before, "codex 拒绝同样零副作用");
    const codexHigh = await saveRuntimeConfig({ runtime: "codex", updates: { ANS_CODEX_REASONING_EFFORT: "high" } }, { envPath: t.envPath });
    assert.equal(codexHigh.ok, true);
    const claudeOff = await saveRuntimeConfig({ runtime: "claude", updates: { ANS_CLAUDE_REASONING_EFFORT: "off" } }, { envPath: t.envPath });
    assert.equal(claudeOff.ok, true, "claude 收 off");
    const file = await readEnvFile(t.envPath);
    assert.equal(file["ANS_CODEX_REASONING_EFFORT"], "high");
    assert.equal(file["ANS_CLAUDE_REASONING_EFFORT"], "off");
  } finally { t.cleanup(); }
});

test("F4 trim 规范形：带空白提交按 trim 后规范形写盘；非规范大小写如实拒绝（写侧只收规范值，读侧宽松属读取态）", async () => {
  const t = tempEnv();
  try {
    const saved = await saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_REASONING_EFFORT: "  xhigh\t" } }, { envPath: t.envPath });
    assert.equal(saved.ok, true);
    assert.equal((await readEnvFile(t.envPath))["ANS_PI_REASONING_EFFORT"], "xhigh", "trim 后规范形落盘");
    const upper = await saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_REASONING_EFFORT: "HIGH" } }, { envPath: t.envPath });
    assert.equal(upper.ok, false, "非规范形拒绝");
    assert.equal((upper.error ?? "").includes("HIGH"), false, "不回显原文（大小写亦不回显）");
    assert.equal((await readEnvFile(t.envPath))["ANS_PI_REASONING_EFFORT"], "xhigh", "拒绝后原值保持");
  } finally { t.cleanup(); }
});

test("F5 空串/纯空白清除合法：写盘清除、读取回落未设态（source=default）", async () => {
  const t = tempEnv();
  try {
    await saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_REASONING_EFFORT: "low" } }, { envPath: t.envPath });
    const cleared = await saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_REASONING_EFFORT: "   " } }, { envPath: t.envPath });
    assert.equal(cleared.ok, true, "留空＝清除（合法）");
    assert.deepEqual(cleared.appliedKeys, ["ANS_PI_REASONING_EFFORT"]);
    const view = await getRuntimeConfig("pi", { envPath: t.envPath, env: {} });
    const field = view.fields.find((candidate) => candidate.key === "ANS_PI_REASONING_EFFORT")!;
    assert.equal(field.isSet, false, "清除后未设");
    assert.equal(field.source, "default", "未设＝平台默认态");
  } finally { t.cleanup(); }
});

test("F6 批量原子：同批含非法档位 ⇒ 整批拒绝（合法键也不落盘）；未知键静默过滤（现状）；URL 校验现状不动", async () => {
  const t = tempEnv();
  try {
    fs.writeFileSync(t.envPath, "ANS_PI_MODEL=old-model\nANS_PI_BASE_URL=https://gw.example.com/\n");
    const before = fs.readFileSync(t.envPath, "utf8");
    const batch = await saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_MODEL: "new-model", ANS_PI_REASONING_EFFORT: "nope" } }, { envPath: t.envPath });
    assert.equal(batch.ok, false, "整批拒绝");
    assert.equal(fs.readFileSync(t.envPath, "utf8"), before, "批内合法键（模型）也不落盘（原子拒绝）");
    // 未知键过滤 + 合法档位同批 ⇒ 正常通过。
    const mixed = await saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_REASONING_EFFORT: "medium", EVIL_KEY: "x" } }, { envPath: t.envPath });
    assert.equal(mixed.ok, true);
    assert.deepEqual(mixed.appliedKeys, ["ANS_PI_REASONING_EFFORT"], "未知键不进写盘面");
    assert.equal(fs.readFileSync(t.envPath, "utf8").includes("EVIL_KEY"), false);
    // URL 校验现状（回归钉）：非法 URL 仍拒。
    const badUrl = await saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_BASE_URL: "ftp://nope" } }, { envPath: t.envPath });
    assert.equal(badUrl.ok, false);
    assert.equal(badUrl.error, "API 地址须为不含用户名或密码的 http/https 地址。");
    // 非字符串值：类型校验先行（现状文案）。
    const badType = await saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_REASONING_EFFORT: 3 as never } }, { envPath: t.envPath });
    assert.equal(badType.ok, false);
    assert.equal(badType.error, "设置值必须是字符串。");
  } finally { t.cleanup(); }
});

// —————————————————————— ③ 读取链：choices 透传 / 来源五态不受新键影响 ——————————————————————

test("F7 读取链：choices 元数据经视图透传（控件数据源）；推理键来源五态（unset/default/file/environment）如实", async () => {
  const t = tempEnv();
  try {
    // unset（无文件无 env）：source=default（可选字段的未设态）。
    const unsetView = await getRuntimeConfig("claude", { envPath: path.join(path.dirname(t.envPath), "absent.env"), env: {} });
    const unsetField = unsetView.fields.find((candidate) => candidate.key === "ANS_CLAUDE_REASONING_EFFORT")!;
    assert.equal(unsetField.source, "default");
    assert.deepEqual([...(unsetField.choices ?? [])], ["off", "low", "medium", "high", "xhigh"], "choices 透传（读取面）");
    // file 来源。
    await saveRuntimeConfig({ runtime: "claude", updates: { ANS_CLAUDE_REASONING_EFFORT: "high" } }, { envPath: t.envPath });
    const fileView = await getRuntimeConfig("claude", { envPath: t.envPath, env: {} });
    const fileField = fileView.fields.find((candidate) => candidate.key === "ANS_CLAUDE_REASONING_EFFORT")!;
    assert.equal(fileField.source, "file");
    assert.equal(fileField.value, "high");
    // environment 来源（无文件、进程 env 注入）。
    const envView = await getRuntimeConfig("claude", { envPath: path.join(path.dirname(t.envPath), "absent.env"), env: { ANS_CLAUDE_REASONING_EFFORT: "low" } });
    const envField = envView.fields.find((candidate) => candidate.key === "ANS_CLAUDE_REASONING_EFFORT")!;
    assert.equal(envField.source, "environment");
    assert.equal(envField.value, "low");
    // missingKeys 判据不受新键影响（可选）。
    assert.equal(fileView.missingKeys.includes("ANS_CLAUDE_REASONING_EFFORT"), false);
  } finally { t.cleanup(); }
});

// —————————————————————— ④ Pi 旧面板路径：逐键对齐（漂移守卫现值）＋无值域校验为如实现状 ——————————————————————

test("F8 pi-config 与注册表逐键对齐（漂移守卫现值）；旧面板路径无值域校验（如实钉，不复制第二份判定）", async () => {
  assert.deepEqual(
    [...PI_PANEL_KEYS].sort(),
    RUNTIME_SETTINGS.pi.fields.map((field) => field.key).sort(),
    "面板键集 ≡ RUNTIME_SETTINGS.pi 字段集（逐键对齐）",
  );
  const t = tempEnv();
  try {
    const env: Record<string, string | undefined> = {};
    const legacy = await savePiConfig({ envPath: t.envPath, updates: { ANS_PI_REASONING_EFFORT: "not-a-level" }, env });
    assert.equal(legacy.ok, true, "旧面板路径按键面直写（无第二份值域判定）");
    assert.equal(env["ANS_PI_REASONING_EFFORT"], "not-a-level", "值原样落盘（如实现状）");
    // 未知键越界写仍被拒面。
    const offPanel = await savePiConfig({ envPath: t.envPath, updates: { ANS_PI_PROVIDER: "x" }, env });
    assert.deepEqual(offPanel.appliedKeys, [], "面板外键不写（写纪律不动）");
    // 读取视图逐键含新键（值可见、非机密）。
    const view = await getPiConfig(t.envPath);
    const field = view.fields.find((candidate) => candidate.key === "ANS_PI_REASONING_EFFORT")!;
    assert.equal(field.secret, false);
    assert.equal(field.value, "not-a-level");
    assert.equal(field.isSet, true);
  } finally { t.cleanup(); }
});
