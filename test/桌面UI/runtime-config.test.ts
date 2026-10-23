// test/桌面UI/runtime-config.test.ts
// Phase 4A 纯逻辑：控件选择（range/select/text/password）、档位映射、updates 构造、
// 读取结果校验、状态/缺配/application/source 文案、读取/保存版本守卫。

import test from "node:test";
import assert from "node:assert/strict";
import {
  applicationLabel,
  buildConfigUpdates,
  configCompleteText,
  configWarningText,
  engineSettingsTitle,
  fieldControl,
  fieldHelp,
  fieldLabelText,
  initialFieldValues,
  isShortTier,
  loadTokenCurrent,
  missingKeysOf,
  missingNoticeText,
  nextLoadToken,
  nextSaveToken,
  openEngineSettingsLabel,
  partitionFields,
  rangeFallsBack,
  rangeIndex,
  rangeLabel,
  rangeValue,
  readFailureNoticeText,
  readFailureStatusText,
  RUNTIME_LABELS,
  RUNTIME_LABEL_KEYS,
  runtimeLabel,
  saveFailureStatusText,
  applicationShortLabel,
  savedStatusText,
  savedStatusTitle,
  saveTokenCurrent,
  sourceLabel,
  validateRuntimeConfigView,
  type ConfigField,
  type RuntimeConfigView,
} from "../../app/renderer/src/chat/runtime-config.ts";

const piFields: ConfigField[] = [
  { key: "ANTHROPIC_AUTH_TOKEN", label: "访问令牌", required: true, secret: true },
  { key: "ANS_PI_BASE_URL", label: "API 地址", required: true },
  { key: "ANS_PI_MODEL", label: "模型", required: true },
  {
    key: "ANS_PI_CONTEXT_WINDOW",
    label: "上下文窗口",
    control: "range",
    choices: ["", "32768", "65536", "131072", "262144", "500000", "1048576"],
    choiceLabels: ["系统默认（500k）", "32k", "64k", "128k", "256k", "500k", "1M"],
    value: "65536",
    isSet: true,
  },
  {
    key: "ANS_PI_PROMPT_TIMEOUT_MS",
    label: "看护检查时限",
    control: "range",
    choices: ["", "60000", "120000"],
    choiceLabels: ["系统默认（5 分钟）", "1 分钟", "2 分钟"],
    value: "",
    isSet: false,
  },
  {
    key: "ANS_PI_REASONING_EFFORT",
    label: "推理强度",
    choices: ["off", "low", "medium", "high", "xhigh"],
    choiceLabels: ["关", "低", "中", "高", "极高"],
    value: "medium",
    isSet: true,
  },
];

test("短档位判定：≤5 且标签非空 ≤4 字才走 select", () => {
  assert.equal(isShortTier(["off", "low"], ["关", "低"]), true);
  assert.equal(isShortTier(["", "1", "2", "3", "4"], ["系统默认值", "1", "2", "3", "4"]), false);
  assert.equal(isShortTier(["a", "b", "c", "d", "e", "f"], ["1", "2", "3", "4", "5", "6"]), false);
  assert.equal(isShortTier(["a", "b"], ["", "b"]), false);
  assert.equal(isShortTier(["a"], ["长标签超过四字"]), false);
});

test("控件矩阵：secret > range 长档 > short select > 自由文本", () => {
  assert.equal(fieldControl(piFields[0]), "password");
  assert.equal(fieldControl(piFields[3]), "range");
  assert.equal(fieldControl(piFields[5]), "select");
  assert.equal(fieldControl({ key: "X" }), "text");
  // control:range + 短档位 ⇒ select（不按 key 分叉）
  assert.equal(
    fieldControl({ key: "Y", control: "range", choices: ["a", "b"], choiceLabels: ["甲", "乙"] }),
    "select",
  );
});

test("range 下标/规范值/标签：越界回退空串、不在预设回退文本", () => {
  const choices = piFields[3].choices!;
  assert.equal(rangeIndex(choices, "65536"), 2);
  assert.equal(rangeIndex(choices, "999"), -1);
  assert.equal(rangeValue(choices, 0), "");
  assert.equal(rangeValue(choices, 6), "1048576");
  assert.equal(rangeValue(choices, 99), "");
  assert.equal(rangeLabel(choices, piFields[3].choiceLabels, 1), "32k");
  assert.equal(rangeFallsBack({ ...piFields[3], value: "999" }), true);
  assert.equal(rangeFallsBack({ ...piFields[3], value: "" }), false);
});

test("字段分组：range 进高级，其余必填在前可选在后", () => {
  const { main, advanced } = partitionFields([
    { key: "OPT", required: false },
    { key: "RANGE", control: "range", choices: ["", "1"], choiceLabels: ["默认", "1"] },
    { key: "REQ", required: true },
  ]);
  assert.deepEqual(main.map((field) => field.key), ["REQ", "OPT"]);
  assert.deepEqual(advanced.map((field) => field.key), ["RANGE"]);
});

test("初值与 updates：机密恒空；空机密不下发；非机密空且 isSet 才清除", () => {
  const fields: ConfigField[] = [
    { key: "A", secret: true, isSet: true, value: "" },
    { key: "B", isSet: true, value: "old" },
    { key: "C", isSet: false, value: "" },
    { key: "D", isSet: false, value: "keep" },
  ];
  assert.deepEqual(initialFieldValues(fields), { A: "", B: "old", C: "", D: "keep" });
  assert.deepEqual(
    buildConfigUpdates(fields, { A: "", B: "", C: "", D: "next" }),
    { B: "", D: "next" },
  );
  assert.deepEqual(
    buildConfigUpdates(fields, { A: "secret", B: "v", C: "", D: "" }),
    { A: "secret", B: "v" },
  );
});

test("读取结果校验：runtime/fields/missingKeys 必须齐备，畸形按读取失败", () => {
  const good = {
    runtime: "pi",
    label: "Pi",
    path: "/p/.env",
    revision: 2,
    application: "next-session",
    missingKeys: ["ANS_PI_MODEL"],
    fields: piFields,
  };
  const ok = validateRuntimeConfigView(good, "pi");
  assert.equal(ok.ok, true);
  assert.equal(ok.view?.missingKeys[0], "ANS_PI_MODEL");
  assert.deepEqual(missingKeysOf(ok.view), ["ANS_PI_MODEL"]);
  assert.equal(validateRuntimeConfigView({ ...good, runtime: "codex" }, "pi").ok, false);
  assert.equal(validateRuntimeConfigView({ ...good, fields: undefined }, "pi").ok, false);
  assert.equal(validateRuntimeConfigView({ ...good, missingKeys: undefined }, "pi").ok, false);
  assert.equal(validateRuntimeConfigView({ ...good, missingKeys: "x" }, "pi").ok, false);
  assert.equal(validateRuntimeConfigView(null, "pi").ok, false);
});

test("B4 引擎显示名：demo 走共享 key（zh/en），Pi/Codex/Claude 品牌名原样", () => {
  // 本地映射语言中性：不保存 demo 中文；用户可见文案只来自共享 key。
  assert.deepEqual(RUNTIME_LABELS, {
    demo: "demo",
    pi: "Pi",
    codex: "Codex",
    claude: "Claude",
  });
  assert.equal(/[一-鿿]/.test(Object.values(RUNTIME_LABELS).join("")), false);
  assert.equal(RUNTIME_LABEL_KEYS.demo, "shared.runtimeSettings.runtime.demo");
  assert.equal(RUNTIME_LABEL_KEYS.pi, null);
  assert.equal(RUNTIME_LABEL_KEYS.codex, null);
  assert.equal(RUNTIME_LABEL_KEYS.claude, null);

  // zh-CN 逐字沿用共享目录；en-US 同 key 解析为 Demo；品牌名两种语言都不翻译。
  assert.equal(runtimeLabel("demo"), "演示");
  assert.equal(runtimeLabel("demo", "en-US"), "Demo");
  const brands = ["pi", "codex", "claude"] as const;
  for (const brand of brands) {
    assert.equal(runtimeLabel(brand), RUNTIME_LABELS[brand]);
    assert.equal(runtimeLabel(brand, "en-US"), RUNTIME_LABELS[brand]);
  }

  // 未知引擎：非空原样透传；空值走本地化文案（不发明标签）。
  assert.equal(runtimeLabel("future-engine"), "future-engine");
  assert.equal(runtimeLabel("future-engine", "en-US"), "future-engine");
  assert.equal(runtimeLabel("", "zh-CN"), "未知引擎");
  assert.equal(runtimeLabel("", "en-US"), "Unknown engine");
});

test("B4 读取视图：主进程未给 label 时按 locale 解析，显式 label 优先", () => {
  const demo = validateRuntimeConfigView(
    { runtime: "demo", missingKeys: [], fields: [] },
    "demo",
    "en-US",
  );
  assert.equal(demo.ok, true);
  assert.equal(demo.view?.label, "Demo");

  const zh = validateRuntimeConfigView(
    { runtime: "demo", missingKeys: [], fields: [] },
    "demo",
    "zh-CN",
  );
  assert.equal(zh.view?.label, "演示");

  const labelled = validateRuntimeConfigView(
    { runtime: "demo", label: "Custom", missingKeys: [], fields: [] },
    "demo",
    "zh-CN",
  );
  assert.equal(labelled.view?.label, "Custom");
});

test("文案：缺配/齐备/application/来源/帮助/入口标题逐字基线", () => {
  assert.equal(runtimeLabel("codex"), "Codex");
  assert.equal(
    configWarningText("Pi", ["A", "B"]),
    "Pi 配置不完整，缺：A、B。请补齐后保存。",
  );
  assert.equal(
    missingNoticeText("Claude", ["K"]),
    "Claude 配置不完整，缺：K。请补齐后保存。",
  );
  assert.equal(
    readFailureNoticeText("Pi"),
    "读取 Pi 配置失败，请打开设置检查或重试。",
  );
  assert.equal(
    configCompleteText("Pi", "next-session"),
    "Pi 必填配置已齐备。下一次开启会话时应用。",
  );
  assert.equal(applicationLabel("current"), "当前配置已应用。");
  assert.equal(
    applicationLabel("after-active-turn"),
    "当前轮次继续使用原配置；结束后下一次输入应用新配置。",
  );
  assert.equal(applicationLabel("unknown"), "配置应用时点未报告。");
  assert.equal(sourceLabel({ key: "K", source: "fallback", fallbackKey: "OPENAI_API_KEY" }), "回退（OPENAI_API_KEY）");
  assert.equal(sourceLabel({ key: "K", source: "file" }), "文件");
  assert.equal(sourceLabel({ key: "K" }), "来源未报告");
  assert.equal(
    fieldHelp({ key: "CODEX_API_KEY", source: "fallback", fallbackKey: "OPENAI_API_KEY", help: "已有 OPENAI_API_KEY 时可使用其作为凭据。" }),
    "CODEX_API_KEY · 回退（OPENAI_API_KEY）。已有 OPENAI_API_KEY 时可使用其作为凭据。",
  );
  assert.equal(fieldLabelText(piFields[0]), "访问令牌 · 必填");
  assert.equal(fieldLabelText(piFields[3]), "上下文窗口 · 可选");
  assert.equal(engineSettingsTitle("Claude"), "Claude 配置");
  assert.equal(openEngineSettingsLabel("Pi"), "打开 Pi 设置");
  assert.equal(readFailureStatusText(new Error("boom")), "读取配置失败：boom");
  assert.equal(saveFailureStatusText("离线原子写失败"), "保存失败：离线原子写失败");
  assert.equal(saveFailureStatusText(""), "保存失败：未知错误");
  assert.equal(
    savedStatusText(["A", "B"], ["C"], "next-session"),
    "已保存到 .env（改动键 2 个）。必填配置仍缺 1 项（见上方）。下一次开启会话时应用。",
  );
  assert.equal(
    savedStatusText([], [], "current"),
    "已保存到 .env（改动键 无）。必填配置已齐备。当前配置已应用。",
  );
  assert.equal(
    savedStatusTitle(["A", "B"], ["C"], "next-session"),
    "已保存到 .env（改动键：A、B）。必填配置仍缺：C。下一次开启会话时应用。",
  );
  assert.equal(applicationShortLabel("after-active-turn"), "当前轮次继续使用原配置；下一次输入应用。");
});

test("读取/保存版本守卫：晚到旧响应不匹配最新 token", () => {
  const first = nextLoadToken(0, "pi", "/p");
  const second = nextLoadToken(first.version, "pi", "/p");
  assert.equal(loadTokenCurrent(first, second, "pi", "/p"), false);
  assert.equal(loadTokenCurrent(second, second, "pi", "/p"), true);
  assert.equal(loadTokenCurrent(second, second, "codex", "/p"), false);
  assert.equal(loadTokenCurrent(second, second, "pi", "/q"), false);

  const save1 = nextSaveToken(0, "claude", "/p");
  const save2 = nextSaveToken(save1.version, "claude", "/p");
  assert.equal(saveTokenCurrent(save1, save2, "claude", "/p"), false);
  assert.equal(saveTokenCurrent(save2, save2, "claude", "/p"), true);
  assert.equal(saveTokenCurrent(save2, save2, "pi", "/p"), false);
});

test("视图应用文案：current/next-session/after-active-turn 各自区分", () => {
  const view: RuntimeConfigView = {
    runtime: "pi",
    label: "Pi",
    application: "after-active-turn",
    missingKeys: [],
    fields: [],
  };
  assert.equal(
    configCompleteText(view.label || "Pi", view.application),
    "Pi 必填配置已齐备。当前轮次继续使用原配置；结束后下一次输入应用新配置。",
  );
});
