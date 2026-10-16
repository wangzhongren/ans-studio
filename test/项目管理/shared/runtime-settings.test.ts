import assert from "node:assert/strict";
import { test } from "node:test";
import { isSecretKey } from "../../../src/common/shared/env-file.ts";
import { RUNTIME_SETTINGS, getRuntimeSettingsDefinition } from "../../../src/common/shared/runtime-settings.ts";

test("真实引擎的设置秘密键全部由同一掩码名单覆盖，别名亦不回显", () => {
  for (const definition of Object.values(RUNTIME_SETTINGS)) {
    for (const field of definition.fields) {
      assert.equal(isSecretKey(field.key), field.secret, `${definition.runtime}:${field.key}`);
      for (const alternative of field.fallbackKeys ?? []) assert.equal(isSecretKey(alternative), true);
    }
  }
  assert.equal(getRuntimeSettingsDefinition("demo"), undefined);
});

test("设置需求忠于真实适配器：Pi 显式 endpoint/model，Claude 可用 SDK 默认模型", () => {
  const required = (runtime: keyof typeof RUNTIME_SETTINGS) => RUNTIME_SETTINGS[runtime].fields.filter((field) => field.required).map((field) => field.key);
  assert.deepEqual(required("pi"), ["ANTHROPIC_AUTH_TOKEN", "ANS_PI_BASE_URL", "ANS_PI_MODEL"]);
  assert.deepEqual(required("claude"), ["ANTHROPIC_API_KEY"]);
  assert.deepEqual(required("codex"), ["CODEX_API_KEY", "ANS_CODEX_MODEL"]);
  assert.deepEqual(RUNTIME_SETTINGS.codex.fields[0].fallbackKeys, ["OPENAI_API_KEY"]);
  assert.ok(!RUNTIME_SETTINGS.claude.fields.some((field) => field.key === "CLAUDE_CODE_OAUTH_TOKEN"));
});

// ———————— G-5 推理强度（客户 2026-10-16 批准）：三平台字段登记 ————————

const REASONING_RUNTIMES = ["pi", "codex", "claude"] as const;
const REASONING_KEYS: Record<(typeof REASONING_RUNTIMES)[number], string> = {
  pi: "ANS_PI_REASONING_EFFORT",
  codex: "ANS_CODEX_REASONING_EFFORT",
  claude: "ANS_CLAUDE_REASONING_EFFORT",
};
/** 逐字口径：三平台统一（档位名称梯；缺省档语义由平台自定，故括注）。 */
const REASONING_HELP = "留空＝维持平台默认（现状零变化）；档位依次为 关/低/中/高/极高（缺省档语义见平台）；思考计入输出 tokens。";
const reasoningField = (runtime: (typeof REASONING_RUNTIMES)[number]) =>
  RUNTIME_SETTINGS[runtime].fields.find((field) => field.key === REASONING_KEYS[runtime]);

test("推理强度：三平台逐键在场，label 逐字「推理强度」，可选、非机密", () => {
  for (const runtime of REASONING_RUNTIMES) {
    const matching = RUNTIME_SETTINGS[runtime].fields.filter((field) => field.label === "推理强度");
    assert.equal(matching.length, 1, `${runtime}: label「推理强度」应恰好一字段`);
    const field = matching[0]!;
    assert.equal(field.key, REASONING_KEYS[runtime]);
    assert.equal(field.required, false, `${runtime}: 推理强度可选`);
    assert.equal(field.secret, false, `${runtime}: 推理强度非机密`);
  }
});

test("推理强度 choices ＝平台真实档位：Codex 无 off（平台无该档，如实不假装）", () => {
  assert.deepEqual(reasoningField("pi")?.choices, ["off", "low", "medium", "high", "xhigh"]);
  assert.deepEqual(reasoningField("codex")?.choices, ["low", "medium", "high", "xhigh"]);
  assert.ok(!(reasoningField("codex")?.choices ?? []).includes("off"), "Codex 平台无 off 档——不得假装有");
  assert.deepEqual(reasoningField("claude")?.choices, ["off", "low", "medium", "high", "xhigh"]);
});

test("推理强度 help 三平台统一口径（逐字：留空＝维持平台默认；档位梯；思考计入输出 tokens）", () => {
  for (const runtime of REASONING_RUNTIMES) {
    assert.equal(reasoningField(runtime)?.help, REASONING_HELP, runtime);
  }
});

test("choices 元数据纪律：非空值域、选项为逐字非空字符串、机密字段不出选项", () => {
  for (const definition of Object.values(RUNTIME_SETTINGS)) {
    for (const field of definition.fields) {
      if (field.choices === undefined) continue;
      assert.ok(field.choices.length > 0, `${definition.runtime}:${field.key}: 空值域应按未设置（自由文本）处理`);
      for (const choice of field.choices) {
        assert.ok(choice.trim() !== "", `${definition.runtime}:${field.key}: 选项须为非空字符串`);
      }
      assert.equal(field.secret, false, `${definition.runtime}:${field.key}: 机密字段不得挂 choices`);
    }
  }
});
