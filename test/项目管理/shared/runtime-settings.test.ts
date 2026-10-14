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
