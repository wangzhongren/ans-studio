// test/测试/g4-skill-verify/i-cleanpatterns.test.ts —— G-4 独立验证 I 域：**cleanPatterns 轻修（A-base 收窄）**。
//
// 对抗性独立构造：① 复现转正（多条目第 2 条起标题完整——本角色 G-3 备注①的最小复现直接升级为正向钉）；
// ② 零泄漏 battery（CJK 查询值＋全角标点紧贴全矩阵——剥离口径只紧不松）；③ ASCII `;` 路径参数不回归；
// ④ 全角括号/后缀 mojibake 消除；⑤ redacted/truncated 标记语义不变；⑥ Codex 诊断 redact 同口径。
// 全部经真实 `protectText` / 真实 Codex `settings().redact`（只读运行，无任何网络）。

import test from "node:test";
import assert from "node:assert/strict";

import { createToolDisplayContext } from "../../../src/common/runtime-core/tool-display.ts";
import { settings } from "../../../src/common/codex-adapter/config.ts";

const { protectText } = createToolDisplayContext({ env: {} });
const P = (text: string) => protectText(text, 16384);

// —————————————————————— ① 复现转正 ——————————————————————

test("复现转正：G-3 备注①最小复现（「；」连接的 Pi 搜索行）——第 2 条标题完整、秘密剥净、标志如实", () => {
  const raw = "查询「独立对抗查询-ZX9」 → 2 条结果：独立标题-ALPHA — https://verify.test/entry?token=对抗参数-绝不外泄#frag；独立标题-BETA — https://verify.test/beta";
  const out = P(raw);
  assert.ok(out.text.includes("独立标题-BETA"), "第 2 条标题完整可见（旧贪婪吞并不得复现）");
  assert.ok(out.text.includes("独立标题-ALPHA"), "第 1 条标题完整");
  assert.ok(out.text.includes("https://verify.test/entry") && out.text.includes("https://verify.test/beta"), "两条 URL host+path 归一保留");
  assert.equal(out.text.includes("对抗参数-绝不外泄"), false, "URL query 值剥除（零泄漏）");
  assert.equal(out.text.includes("#frag"), false, "hash 剥除");
  assert.equal(out.redacted, true, "发生过归一替换 ⇒ redacted 标记不变");
  assert.equal(out.truncated, false, "未超预算 ⇒ truncated=false");
});

test("后缀/括号变体（mojibake 消除）：`；…（共 N 条）` 与 `（URL）后文` 逐字保真、无 %EF%BC", () => {
  const suffix = "T2 — https://verify.test/b；…（共 20 条）";
  const s = P(suffix);
  assert.equal(s.text, "T2 — https://verify.test/b；…（共 20 条）", "后缀逐字保真（旧行为：吞入 path 并 percent-encode）");
  assert.equal(s.text.includes("%EF%BC"), false, "无全角分号 mojibake");
  const paren = "（https://a.test/x）后文";
  assert.equal(P(paren).text, "（https://a.test/x）后文", "括号变体逐字保真");
});

// —————————————————————— ② 零泄漏 battery ——————————————————————

test("零泄漏 battery（对抗）：CJK 值＋全角标点紧贴全矩阵——秘密一律不可见（剥离口径只紧不松）", () => {
  const SECRETS = ["对抗参数-绝不外泄", "密值Ω"];
  const battery = [
    "https://verify.test/entry?token=对抗参数-绝不外泄#frag",
    "前文 https://verify.test/entry?token=对抗参数-绝不外泄；后文",
    "前文（https://verify.test/entry?token=对抗参数-绝不外泄）后文",
    "前文 https://verify.test/entry?token=对抗参数-绝不外泄。后文",
    "前文（https://verify.test/entry?token=对抗参数-绝不外泄）。后文",
    "https://user:pass@verify.test/entry?token=对抗参数-绝不外泄",
    "A — https://verify.test/x?q=密值Ω；B — https://verify.test/y?r=对抗参数-绝不外泄；C",
    "前文 https://verify.test/p;jsessionid=abc?token=对抗参数-绝不外泄；尾",
  ];
  for (const [i, raw] of battery.entries()) {
    const out = P(raw);
    for (const secret of SECRETS) {
      assert.equal(out.text.includes(secret), false, `battery[${i}] 泄漏了「${secret}」：${out.text}`);
    }
    assert.equal(/user:pass/.test(out.text), false, `battery[${i}] userinfo 未剥除`);
  }
});

// —————————————————————— ③ ASCII `;` 不回归 ——————————————————————

test("ASCII `;` 路径参数不回归：`;jsessionid=` 完整留在 URL 内（排除集只增 CJK 块）", () => {
  const out = P("见 https://a.test/p;jsessionid=abc123 后续");
  assert.equal(out.text, "见 https://a.test/p;jsessionid=abc123 后续", "ASCII 分号在 URL 字符集内");
});

// —————————————————————— ④ 显示预算/标志不放松 ——————————————————————

test("显示预算不变：超限截断仍发生（truncated=true、前缀保留）；redacted 语义逐字沿用", () => {
  const long = `前缀-${"甲".repeat(20)}` + " https://verify.test/entry?token=对抗参数-绝不外泄 尾";
  const small = protectText(long, 40);
  assert.equal(small.truncated, true, "小预算下截断仍发生");
  assert.equal(Buffer.byteLength(small.text) <= 40, true, "字节预算生效");
  assert.equal(small.redacted, true, "仍发生过清洗替换");
  assert.equal(small.text.includes("对抗参数-绝不外泄"), false, "截断与剥密同时成立（先清洗后截断）");
  // 纯文本无替换 ⇒ 两标志皆 false（语义不夸大）。
  const plain = P("普通文本无 URL");
  assert.equal(plain.redacted, false);
  assert.equal(plain.truncated, false);
});

test("控制字符清洗不变：\\u0000-\\u0008 等仍替换为 uFFFD（本条只带回显，不放松）", () => {
  const out = P("a\u0001b\u000e[c");
  assert.equal(out.text, "a�b�[c", "控制字符清洗逐字不变");
});

// —————————————————————— ⑤ Codex 诊断 redact 同口径 ——————————————————————

test("Codex 诊断 redact 同口径：URL 紧贴全角标点不吞尾；userinfo/query 剥除；环境秘密值替换不变", () => {
  const prev = process.env.G4_CODEX_VERIFY_KEY;
  process.env.G4_CODEX_VERIFY_KEY = "SECRET_CODEX_VALUE_123";
  try {
    const config = settings(
      {
        runtime: "codex",
        projectRoot: "/fixture",
        skillRoot: "/fixture",
        tools: [],
        interactionGate: { begin() {}, end() {}, isWaiting: () => false, onChange: () => () => {} },
        currentTurnId: () => undefined,
        modelId: "verify-model",
      },
      { CODEX_API_KEY: "SECRET_CODEX_VALUE_123", G4_CODEX_VERIFY_KEY: "SECRET_CODEX_VALUE_123", PATH: process.env.PATH },
    );
    const r1 = config.redact("失败于 https://user:pw@verify.test/entry?token=tok123#f；后续文本 ABC");
    assert.ok(r1.includes("；后续文本 ABC"), `全角分号后文本保留：${r1}`);
    assert.equal(r1.includes("tok123"), false, "query 剥除");
    assert.equal(/user:pw@/.test(r1), false, "userinfo 剥除");
    const r2 = config.redact("凭据=SECRET_CODEX_VALUE_123；后续");
    assert.equal(r2.includes("SECRET_CODEX_VALUE_123"), false, "环境秘密值整串替换不放松");
    assert.ok(r2.includes("；后续"), "秘密值替换不吞尾文本");
  } finally {
    if (prev === undefined) delete process.env.G4_CODEX_VERIFY_KEY;
    else process.env.G4_CODEX_VERIFY_KEY = prev;
  }
});
