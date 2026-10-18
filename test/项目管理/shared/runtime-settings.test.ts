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

// ———————— 客户 2026-10-18 改口：思考强度改回下拉（不挂 control，choices 默认渲染为 select） ————————

test("推理强度改回下拉：三字段不挂 control，choiceLabels 与 choices 逐档对齐", () => {
  assert.equal(reasoningField("pi")?.control, undefined, "Pi 推理强度用默认下拉（非滑块）");
  assert.deepEqual(
    reasoningField("pi")?.choiceLabels,
    ["关", "低", "中", "高", "极高"],
    "Pi 推理强度标签逐档对齐（含 off 档「关」）",
  );

  assert.equal(reasoningField("codex")?.control, undefined, "Codex 推理强度用默认下拉（非滑块）");
  assert.deepEqual(
    reasoningField("codex")?.choiceLabels,
    ["低", "中", "高", "极高"],
    "Codex 推理强度标签逐档对齐（无 off 档）",
  );

  assert.equal(reasoningField("claude")?.control, undefined, "Claude 推理强度用默认下拉（非滑块）");
  assert.deepEqual(
    reasoningField("claude")?.choiceLabels,
    ["关", "低", "中", "高", "极高"],
    "Claude 推理强度标签逐档对齐（含 off 档「关」）",
  );
});

test("推理强度 help 三平台统一口径（逐字：留空＝维持平台默认；档位梯；思考计入输出 tokens）", () => {
  for (const runtime of REASONING_RUNTIMES) {
    assert.equal(reasoningField(runtime)?.help, REASONING_HELP, runtime);
  }
});

test("choices 元数据纪律：非空值域、选项为字符串、空串仅作默认/清除档、机密字段不出选项", () => {
  for (const definition of Object.values(RUNTIME_SETTINGS)) {
    for (const field of definition.fields) {
      if (field.choices === undefined) continue;
      assert.ok(field.choices.length > 0, `${definition.runtime}:${field.key}: 空值域应按未设置（自由文本）处理`);
      assert.ok(
        field.choices.filter((choice) => choice === "").length <= 1,
        `${definition.runtime}:${field.key}: 空串「默认/清除」档至多一个`,
      );
      for (const choice of field.choices) {
        assert.equal(typeof choice, "string", `${definition.runtime}:${field.key}: 选项须为字符串`);
        if (choice !== "") assert.ok(choice.trim() !== "", `${definition.runtime}:${field.key}: 非空选项不得为纯空白`);
      }
      assert.equal(field.secret, false, `${definition.runtime}:${field.key}: 机密字段不得挂 choices`);
    }
  }
});

test("choiceLabels/control 元数据纪律：标签与 choices 等长且非空；range 必须有 choices", () => {
  for (const definition of Object.values(RUNTIME_SETTINGS)) {
    for (const field of definition.fields) {
      if (field.choiceLabels !== undefined) {
        assert.ok(field.choices !== undefined, `${definition.runtime}:${field.key}: choiceLabels 须有 choices`);
        assert.equal(
          field.choiceLabels.length,
          field.choices!.length,
          `${definition.runtime}:${field.key}: choiceLabels 须与 choices 等长（逐档对齐）`,
        );
        for (const label of field.choiceLabels) {
          assert.ok(label.trim() !== "", `${definition.runtime}:${field.key}: 友好标签不得为空`);
        }
      }
      if (field.control !== undefined) {
        assert.equal(field.control, "range", `${definition.runtime}:${field.key}: 当前仅支持 range`);
        assert.ok(field.choices !== undefined, `${definition.runtime}:${field.key}: range 须有离散档位`);
      }
    }
  }
});

// ———————— 客户 2026-10-17 裁定：系统默认上下文窗口 500000 ————————

test("Pi 上下文窗口：离散档位滑块、可选、非机密、正整数元数据；help 逐字", () => {
  const field = RUNTIME_SETTINGS.pi.fields.find((item) => item.key === "ANS_PI_CONTEXT_WINDOW");
  assert.ok(field, "Pi 必须有 ANS_PI_CONTEXT_WINDOW 字段");
  assert.equal(field.required, false, "上下文窗口可选（留空即用系统默认）");
  assert.equal(field.secret, false, "上下文窗口非机密");
  assert.deepEqual(
    field.choices,
    ["", "32768", "65536", "131072", "262144", "500000", "1048576"],
    "上下文窗口档位逐字（含空串默认/清除档，最大 1M）",
  );
  assert.deepEqual(
    field.choiceLabels,
    ["系统默认（500k）", "32k", "64k", "128k", "256k", "500k", "1M"],
    "上下文窗口友好标签逐档对齐",
  );
  assert.equal(field.control, "range", "上下文窗口用滑块控件");
  assert.deepEqual(field.integer, { min: 1 }, "上下文窗口须保留正整数声明（min=1）");
  assert.equal(
    field.help,
    "拖动选择预设档位，最大 1M tokens；留空＝系统默认（500k）；下一次开启会话时应用。",
    "help 须逐字说明滑块、上限、默认与生效时机",
  );
});

// ———————— 2026-10-17 批准「到点检查 + 1 小时兜底」：整轮时限改为看护检查时限 ————————

test("Pi 看护检查时限：离散档位滑块、可选、非机密、正整数元数据；help 逐字", () => {
  const field = RUNTIME_SETTINGS.pi.fields.find((item) => item.key === "ANS_PI_PROMPT_TIMEOUT_MS");
  assert.ok(field, "Pi 必须有 ANS_PI_PROMPT_TIMEOUT_MS 字段");
  assert.equal(field.label, "看护检查时限");
  assert.equal(field.required, false, "看护检查时限可选（留空即用系统默认）");
  assert.equal(field.secret, false, "看护检查时限非机密");
  assert.deepEqual(
    field.choices,
    ["", "60000", "120000", "300000", "600000", "900000", "1800000"],
    "看护检查时限档位逐字（含空串默认/清除档）",
  );
  assert.deepEqual(
    field.choiceLabels,
    ["系统默认（5 分钟）", "1 分钟", "2 分钟", "5 分钟", "10 分钟", "15 分钟", "30 分钟"],
    "看护检查时限友好标签逐档对齐",
  );
  assert.equal(field.control, "range", "看护检查时限用滑块控件");
  assert.deepEqual(field.integer, { min: 1000 }, "看护检查时限须保留正整数声明（min=1000ms）");
  assert.equal(
    field.help,
    "到点只通知治理角色检查是否卡死，不中止本轮；仍在推进则不动作；1 小时为最后兜底；留空＝系统默认（5 分钟）；单位 ms；下一次开启会话时应用。",
    "help 须逐字说明不中止、未推进不动作、1 小时兜底、默认、单位与生效时机",
  );
});

test("integer 元数据纪律：边界为整数且 min ≤ max", () => {
  for (const definition of Object.values(RUNTIME_SETTINGS)) {
    for (const field of definition.fields) {
      if (field.integer === undefined) continue;
      const { min, max } = field.integer;
      if (min !== undefined) assert.ok(Number.isInteger(min), `${definition.runtime}:${field.key}: min 须为整数`);
      if (max !== undefined) assert.ok(Number.isInteger(max), `${definition.runtime}:${field.key}: max 须为整数`);
      if (min !== undefined && max !== undefined) {
        assert.ok(min <= max, `${definition.runtime}:${field.key}: min 不得大于 max`);
      }
    }
  }
});
