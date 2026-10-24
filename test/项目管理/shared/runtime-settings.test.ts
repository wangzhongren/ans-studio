import assert from "node:assert/strict";
import { test } from "node:test";
import { isSecretKey } from "../../../src/common/shared/env-file.ts";
import { DEFAULT_LOCALE, translate } from "../../../src/common/shared/i18n/index.ts";
import { RUNTIME_SETTINGS, getRuntimeSettingsDefinition } from "../../../src/common/shared/runtime-settings.ts";

/** 解析共享元数据的展示 key（zh-CN 参考目录；缺 key 会返回 key 本身，测试据此失败）。 */
const zh = (key: Parameters<typeof translate>[1]): string => translate(DEFAULT_LOCALE, key);

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
    const matching = RUNTIME_SETTINGS[runtime].fields.filter((field) => zh(field.labelKey) === "推理强度");
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
    reasoningField("pi")?.choiceLabelKeys?.map(zh),
    ["关", "低", "中", "高", "极高"],
    "Pi 推理强度标签逐档对齐（含 off 档「关」）",
  );

  assert.equal(reasoningField("codex")?.control, undefined, "Codex 推理强度用默认下拉（非滑块）");
  assert.deepEqual(
    reasoningField("codex")?.choiceLabelKeys?.map(zh),
    ["低", "中", "高", "极高"],
    "Codex 推理强度标签逐档对齐（无 off 档）",
  );

  assert.equal(reasoningField("claude")?.control, undefined, "Claude 推理强度用默认下拉（非滑块）");
  assert.deepEqual(
    reasoningField("claude")?.choiceLabelKeys?.map(zh),
    ["关", "低", "中", "高", "极高"],
    "Claude 推理强度标签逐档对齐（含 off 档「关」）",
  );
});

test("推理强度 help 三平台统一口径（逐字：留空＝维持平台默认；档位梯；思考计入输出 tokens）", () => {
  for (const runtime of REASONING_RUNTIMES) {
    const helpKey = reasoningField(runtime)?.helpKey;
    assert.ok(helpKey !== undefined, `${runtime}: 推理强度必须有 helpKey`);
    assert.equal(zh(helpKey), REASONING_HELP, runtime);
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
      if (field.choiceLabelKeys !== undefined) {
        assert.ok(field.choices !== undefined, `${definition.runtime}:${field.key}: choiceLabelKeys 须有 choices`);
        assert.equal(
          field.choiceLabelKeys.length,
          field.choices!.length,
          `${definition.runtime}:${field.key}: choiceLabelKeys 须与 choices 等长（逐档对齐）`,
        );
        for (const key of field.choiceLabelKeys) {
          assert.ok(zh(key).trim() !== "", `${definition.runtime}:${field.key}: 友好标签不得为空（${key}）`);
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
    field.choiceLabelKeys?.map(zh),
    ["系统默认（500k）", "32k", "64k", "128k", "256k", "500k", "1M"],
    "上下文窗口友好标签逐档对齐",
  );
  assert.equal(field.control, "range", "上下文窗口用滑块控件");
  assert.deepEqual(field.integer, { min: 1 }, "上下文窗口须保留正整数声明（min=1）");
  assert.ok(field.helpKey !== undefined, "上下文窗口必须有 helpKey");
  assert.equal(
    zh(field.helpKey),
    "拖动选择预设档位，最大 1M tokens；留空＝系统默认（500k）；下一次开启会话时应用。",
    "help 须逐字说明滑块、上限、默认与生效时机",
  );
});

// ———————— 2026-10-17 批准「到点检查 + 1 小时兜底」：整轮时限改为看护检查时限 ————————

test("Pi 看护检查时限：离散档位滑块、可选、非机密、正整数元数据；help 逐字", () => {
  const field = RUNTIME_SETTINGS.pi.fields.find((item) => item.key === "ANS_PI_PROMPT_TIMEOUT_MS");
  assert.ok(field, "Pi 必须有 ANS_PI_PROMPT_TIMEOUT_MS 字段");
  assert.equal(zh(field.labelKey), "看护检查时限");
  assert.equal(field.required, false, "看护检查时限可选（留空即用系统默认）");
  assert.equal(field.secret, false, "看护检查时限非机密");
  assert.deepEqual(
    field.choices,
    ["", "60000", "120000", "300000", "600000", "900000", "1800000"],
    "看护检查时限档位逐字（含空串默认/清除档）",
  );
  assert.deepEqual(
    field.choiceLabelKeys?.map(zh),
    ["系统默认（5 分钟）", "1 分钟", "2 分钟", "5 分钟", "10 分钟", "15 分钟", "30 分钟"],
    "看护检查时限友好标签逐档对齐",
  );
  assert.equal(field.control, "range", "看护检查时限用滑块控件");
  assert.deepEqual(field.integer, { min: 1000 }, "看护检查时限须保留正整数声明（min=1000ms）");
  assert.ok(field.helpKey !== undefined, "看护检查时限必须有 helpKey");
  assert.equal(
    zh(field.helpKey),
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

// ———————— i18n B4（2026-10-23）：展示文案 key 化，机器语义零变化 ————————

type FieldSemantics = readonly [
  key: string,
  required: boolean,
  secret: boolean,
  fallbackKeys: readonly string[] | null,
  choices: readonly string[] | null,
  control: "range" | null,
  integer: { min?: number; max?: number } | null,
];

const semanticsOf = (runtime: keyof typeof RUNTIME_SETTINGS): FieldSemantics[] =>
  RUNTIME_SETTINGS[runtime].fields.map((field) => [
    field.key,
    field.required,
    field.secret,
    field.fallbackKeys ?? null,
    field.choices ?? null,
    field.control ?? null,
    field.integer ?? null,
  ] as const);

test("B4 零变化：字段集/顺序/必填/secret/fallbackKeys/choices/control/integer 与迁移前基线逐项一致", () => {
  // 基线 = 2026-10-23 B4 迁移前（`git hash-object` bb4545606da4f37d27fe0d2cddac96c436559b4a）的
  // 机器语义逐字快照；本断言不随展示文案 key 化而放宽。
  assert.deepEqual(Object.keys(RUNTIME_SETTINGS), ["pi", "codex", "claude"]);
  assert.deepEqual(semanticsOf("pi"), [
    ["ANTHROPIC_AUTH_TOKEN", true, true, null, null, null, null],
    ["ANS_PI_BASE_URL", true, false, null, null, null, null],
    ["ANS_PI_MODEL", true, false, null, null, null, null],
    ["ANS_PI_CONTEXT_WINDOW", false, false, null,
      ["", "32768", "65536", "131072", "262144", "500000", "1048576"], "range", { min: 1 }],
    ["ANS_PI_PROMPT_TIMEOUT_MS", false, false, null,
      ["", "60000", "120000", "300000", "600000", "900000", "1800000"], "range", { min: 1000 }],
    ["ANS_PI_REASONING_EFFORT", false, false, null, ["off", "low", "medium", "high", "xhigh"], null, null],
  ]);
  assert.deepEqual(semanticsOf("codex"), [
    ["CODEX_API_KEY", true, true, ["OPENAI_API_KEY"], null, null, null],
    ["ANS_CODEX_MODEL", true, false, null, null, null, null],
    ["ANS_CODEX_BASE_URL", false, false, null, null, null, null],
    ["ANS_CODEX_REASONING_EFFORT", false, false, null, ["low", "medium", "high", "xhigh"], null, null],
  ]);
  assert.deepEqual(semanticsOf("claude"), [
    ["ANTHROPIC_API_KEY", true, true, null, null, null, null],
    ["ANS_CLAUDE_MODEL", false, false, null, null, null, null],
    ["ANTHROPIC_BASE_URL", false, false, null, null, null, null],
    ["ANS_CLAUDE_REASONING_EFFORT", false, false, null, ["off", "low", "medium", "high", "xhigh"], null, null],
  ]);
  // 品牌显示名不翻译（demo 无设置定义，显示名走 i18n key，见 runtime-shared.test.ts）。
  assert.equal(RUNTIME_SETTINGS.pi.label, "Pi");
  assert.equal(RUNTIME_SETTINGS.codex.label, "Codex");
  assert.equal(RUNTIME_SETTINGS.claude.label, "Claude");
});

const EXPECTED_DISPLAY: Readonly<Record<string, {
  labelKey: string;
  label: string;
  helpKey?: string;
  help?: string;
  choiceLabelKeys?: readonly string[];
  choiceLabels?: readonly string[];
}>> = {
  "pi:ANTHROPIC_AUTH_TOKEN": {
    labelKey: "shared.runtimeSettings.pi.token.label",
    label: "访问令牌",
  },
  "pi:ANS_PI_BASE_URL": {
    labelKey: "shared.runtimeSettings.field.apiBaseUrl.label",
    label: "API 地址",
  },
  "pi:ANS_PI_MODEL": {
    labelKey: "shared.runtimeSettings.field.model.label",
    label: "模型",
  },
  "pi:ANS_PI_CONTEXT_WINDOW": {
    labelKey: "shared.runtimeSettings.pi.contextWindow.label",
    label: "上下文窗口",
    helpKey: "shared.runtimeSettings.pi.contextWindow.help",
    help: "拖动选择预设档位，最大 1M tokens；留空＝系统默认（500k）；下一次开启会话时应用。",
    choiceLabelKeys: [
      "shared.runtimeSettings.pi.contextWindow.choice.default",
      "shared.runtimeSettings.pi.contextWindow.choice.k32",
      "shared.runtimeSettings.pi.contextWindow.choice.k64",
      "shared.runtimeSettings.pi.contextWindow.choice.k128",
      "shared.runtimeSettings.pi.contextWindow.choice.k256",
      "shared.runtimeSettings.pi.contextWindow.choice.k500",
      "shared.runtimeSettings.pi.contextWindow.choice.m1",
    ],
    choiceLabels: ["系统默认（500k）", "32k", "64k", "128k", "256k", "500k", "1M"],
  },
  "pi:ANS_PI_PROMPT_TIMEOUT_MS": {
    labelKey: "shared.runtimeSettings.pi.promptTimeout.label",
    label: "看护检查时限",
    helpKey: "shared.runtimeSettings.pi.promptTimeout.help",
    help: "到点只通知治理角色检查是否卡死，不中止本轮；仍在推进则不动作；1 小时为最后兜底；留空＝系统默认（5 分钟）；单位 ms；下一次开启会话时应用。",
    choiceLabelKeys: [
      "shared.runtimeSettings.pi.promptTimeout.choice.default",
      "shared.runtimeSettings.pi.promptTimeout.choice.m1",
      "shared.runtimeSettings.pi.promptTimeout.choice.m2",
      "shared.runtimeSettings.pi.promptTimeout.choice.m5",
      "shared.runtimeSettings.pi.promptTimeout.choice.m10",
      "shared.runtimeSettings.pi.promptTimeout.choice.m15",
      "shared.runtimeSettings.pi.promptTimeout.choice.m30",
    ],
    choiceLabels: ["系统默认（5 分钟）", "1 分钟", "2 分钟", "5 分钟", "10 分钟", "15 分钟", "30 分钟"],
  },
  "pi:ANS_PI_REASONING_EFFORT": {
    labelKey: "shared.runtimeSettings.reasoning.label",
    label: "推理强度",
    helpKey: "shared.runtimeSettings.reasoning.help",
    help: REASONING_HELP,
    choiceLabelKeys: [
      "shared.runtimeSettings.reasoning.choice.off",
      "shared.runtimeSettings.reasoning.choice.low",
      "shared.runtimeSettings.reasoning.choice.medium",
      "shared.runtimeSettings.reasoning.choice.high",
      "shared.runtimeSettings.reasoning.choice.xhigh",
    ],
    choiceLabels: ["关", "低", "中", "高", "极高"],
  },
  "codex:CODEX_API_KEY": {
    labelKey: "shared.runtimeSettings.field.apiKey.label",
    label: "API 密钥",
    helpKey: "shared.runtimeSettings.codex.apiKey.help",
    help: "已有 OPENAI_API_KEY 时可使用其作为凭据。",
  },
  "codex:ANS_CODEX_MODEL": {
    labelKey: "shared.runtimeSettings.field.model.label",
    label: "模型",
  },
  "codex:ANS_CODEX_BASE_URL": {
    labelKey: "shared.runtimeSettings.field.apiBaseUrl.label",
    label: "API 地址",
    helpKey: "shared.runtimeSettings.codex.apiBaseUrl.help",
    help: "留空使用 OpenAI API；自定义地址须兼容 Responses API。",
  },
  "codex:ANS_CODEX_REASONING_EFFORT": {
    labelKey: "shared.runtimeSettings.reasoning.label",
    label: "推理强度",
    helpKey: "shared.runtimeSettings.reasoning.help",
    help: REASONING_HELP,
    choiceLabelKeys: [
      "shared.runtimeSettings.reasoning.choice.low",
      "shared.runtimeSettings.reasoning.choice.medium",
      "shared.runtimeSettings.reasoning.choice.high",
      "shared.runtimeSettings.reasoning.choice.xhigh",
    ],
    choiceLabels: ["低", "中", "高", "极高"],
  },
  "claude:ANTHROPIC_API_KEY": {
    labelKey: "shared.runtimeSettings.field.apiKey.label",
    label: "API 密钥",
  },
  "claude:ANS_CLAUDE_MODEL": {
    labelKey: "shared.runtimeSettings.field.model.label",
    label: "模型",
    helpKey: "shared.runtimeSettings.claude.model.help",
    help: "留空使用 SDK 默认模型。",
  },
  "claude:ANTHROPIC_BASE_URL": {
    labelKey: "shared.runtimeSettings.field.apiBaseUrl.label",
    label: "API 地址",
    helpKey: "shared.runtimeSettings.claude.apiBaseUrl.help",
    help: "留空使用 SDK 默认服务。",
  },
  "claude:ANS_CLAUDE_REASONING_EFFORT": {
    labelKey: "shared.runtimeSettings.reasoning.label",
    label: "推理强度",
    helpKey: "shared.runtimeSettings.reasoning.help",
    help: REASONING_HELP,
    choiceLabelKeys: [
      "shared.runtimeSettings.reasoning.choice.off",
      "shared.runtimeSettings.reasoning.choice.low",
      "shared.runtimeSettings.reasoning.choice.medium",
      "shared.runtimeSettings.reasoning.choice.high",
      "shared.runtimeSettings.reasoning.choice.xhigh",
    ],
    choiceLabels: ["关", "低", "中", "高", "极高"],
  },
};

test("B4 key 映射：每字段 label/help/choice 的 key 可解析回迁移前中文（逐字段覆盖，无孤儿/无遗漏）", () => {
  const expectedKeys = Object.keys(EXPECTED_DISPLAY).sort();
  const actualKeys: string[] = [];
  for (const definition of Object.values(RUNTIME_SETTINGS)) {
    for (const field of definition.fields) {
      const id = `${definition.runtime}:${field.key}`;
      actualKeys.push(id);
      const expected = EXPECTED_DISPLAY[id];
      assert.ok(expected, `未登记期望展示映射：${id}`);
      // 共享元数据只携带 key，不再携带固定中文文案。
      assert.equal("label" in field, false, `${id}: 不得保留 label 字面量`);
      assert.equal("help" in field, false, `${id}: 不得保留 help 字面量`);
      assert.equal("choiceLabels" in field, false, `${id}: 不得保留 choiceLabels 字面量`);
      assert.equal(field.labelKey, expected.labelKey, `${id}: labelKey`);
      assert.equal(zh(field.labelKey), expected.label, `${id}: label 解析必须与迁移前中文逐字一致`);
      assert.equal(field.helpKey, expected.helpKey, `${id}: helpKey`);
      if (expected.helpKey !== undefined) {
        assert.equal(zh(field.helpKey as Parameters<typeof translate>[1]), expected.help, `${id}: help 解析必须与迁移前中文逐字一致`);
      }
      assert.deepEqual(field.choiceLabelKeys, expected.choiceLabelKeys, `${id}: choiceLabelKeys`);
      if (expected.choiceLabelKeys !== undefined) {
        assert.deepEqual(field.choiceLabelKeys?.map(zh), expected.choiceLabels, `${id}: choice 解析必须与迁移前中文逐字一致`);
      }
    }
  }
  assert.deepEqual(actualKeys.sort(), expectedKeys, "字段集与期望映射不一致（缺字段或多字段）");
});

test("B4 key 契约：每个 labelKey/helpKey/choiceLabelKey 在 zh-CN 与 en-US 目录均可解析，且 key 为 ASCII 静态标识", () => {
  const referenced = new Set<string>();
  for (const definition of Object.values(RUNTIME_SETTINGS)) {
    for (const field of definition.fields) {
      referenced.add(field.labelKey);
      if (field.helpKey !== undefined) referenced.add(field.helpKey);
      for (const key of field.choiceLabelKeys ?? []) referenced.add(key);
    }
  }
  assert.ok(referenced.size > 0, "未采集到任何展示 key");
  for (const key of referenced) {
    assert.match(key, /^shared\.runtimeSettings\.[a-z0-9.-]+$/i, `key 命名不符合 shared.runtimeSettings.*：${key}`);
    const zhText = translate("zh-CN", key as Parameters<typeof translate>[1]);
    const enText = translate("en-US", key as Parameters<typeof translate>[1]);
    assert.notEqual(zhText, key, `zh-CN 目录缺 key：${key}`);
    assert.notEqual(enText, key, `en-US 目录缺 key：${key}`);
    assert.ok(zhText.length > 0 && enText.length > 0, `目录值为空：${key}`);
  }
});
