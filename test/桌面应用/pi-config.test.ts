// test/桌面应用/pi-config.test.ts
// T28：桌面 Pi 配置面板逻辑（`app/desktop/pi-config.ts` + 经 `interface.ts` 的接线）单测。
//
// 验证（对应任务 T28 验收）：
//  ① 载入：`loadPiEnv` 把假 `.env` 的值带进 env（含机密键）；
//  ② 保存只动指定键、**逐字节保留其余内容**；
//  ③ 掩码：`isSecretKey` 判定的机密键——`getPiConfig` 恒返空 value、只给 isSet；
//  ④ token 不出现在任何错误或回报文本里（**哨兵值断言**）；
//  ⑤ 面板键过滤（只允许写面板键，不得越界写任意键）；
//  ⑥ 保存后重载（下一会话用新值）。
//
// ⚠ **全程只碰系统临时目录**（`os.tmpdir()` 下 mkdtemp）：**绝不指向真实的仓库根 `.env`**
//   ——那会改掉客户真实凭据。所有用例用后清理。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  PI_PANEL_KEYS,
  PI_REQUIRED_KEYS,
  getPiConfig,
  savePiConfig,
  loadPiEnv,
  missingPiKeys,
  resolveRepoEnvPath,
} from "../../app/desktop/pi-config.ts";
import { createDesktopInterface } from "../../app/desktop/interface.ts";

/** 哨兵 token 值——用于断言它绝不出现在视图/回报/错误文本里。 */
const SENTINEL_TOKEN = "SENTINEL-TOKEN-9f3a1c-DO-NOT-LEAK";

/** 造一个临时目录 + 可选 `.env` 内容；返回路径与清理函数。 */
function makeTempEnv(initial?: string): { dir: string; envPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ans-piconf-"));
  const envPath = path.join(dir, ".env");
  if (initial !== undefined) fs.writeFileSync(envPath, initial, "utf8");
  return { dir, envPath, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

test("面板键恰为 3+1（必填 token/端点/模型 + 可选 CONTEXT_WINDOW）；provider 不在面板里；默认路径为仓库根 .env", () => {
  // 客户 2026-10-11：其实不是 5 个，真正必须你填的是 3 个 —— 端点 / 模型 / token（必填）+ 上下文窗口（可选）。
  assert.deepEqual(PI_PANEL_KEYS, [
    "ANTHROPIC_AUTH_TOKEN",
    "ANS_PI_BASE_URL",
    "ANS_PI_MODEL",
    "ANS_PI_CONTEXT_WINDOW",
  ]);
  // 反向守卫：`ANS_PI_PROVIDER` **不在**面板键集合里（它在代码里有默认值 ans-gateway、是内部标签，
  // 不是用户该做的决定；底层仍支持该环境变量，只是不再占一个输入框）。
  assert.ok(!PI_PANEL_KEYS.includes("ANS_PI_PROVIDER"), "provider 绝不进面板键集合");
  // 必填键恰为 3 项，且都是面板键；CONTEXT_WINDOW 是可选（不在必填列）。
  assert.deepEqual(PI_REQUIRED_KEYS, ["ANTHROPIC_AUTH_TOKEN", "ANS_PI_BASE_URL", "ANS_PI_MODEL"]);
  assert.ok(PI_REQUIRED_KEYS.every((k) => PI_PANEL_KEYS.includes(k)), "必填键应含于面板键集合");
  assert.ok(!PI_REQUIRED_KEYS.includes("ANS_PI_CONTEXT_WINDOW"), "上下文窗口是可选，不在必填列");
  // 默认路径指向仓库根（app/desktop 上两级）下的 .env——与 CLI `--env-file=.env` 同一文件。
  assert.equal(path.basename(resolveRepoEnvPath()), ".env");
  assert.ok(resolveRepoEnvPath().endsWith(path.join("ans-cli", ".env")));
});

test("载入：loadPiEnv 把假 .env 的值带进 env（补 --env-file）", async () => {
  const t = makeTempEnv(
    ["# 注释", "ANS_PI_MODEL=model-a", "ANS_PI_BASE_URL=https://example.test/v1", `ANTHROPIC_AUTH_TOKEN=${SENTINEL_TOKEN}`, ""].join("\n"),
  );
  try {
    const env: Record<string, string | undefined> = {};
    const res = await loadPiEnv(env, t.envPath);
    assert.equal(res.path, t.envPath);
    assert.equal(env.ANS_PI_MODEL, "model-a");
    assert.equal(env.ANS_PI_BASE_URL, "https://example.test/v1");
    assert.equal(env.ANTHROPIC_AUTH_TOKEN, SENTINEL_TOKEN, "机密键也应被载入 env（供 Pi 适配器读）");
    // 回报**只含键名、不含值**（凭据不回显）。
    assert.deepEqual([...res.applied].sort(), ["ANTHROPIC_AUTH_TOKEN", "ANS_PI_BASE_URL", "ANS_PI_MODEL"].sort());
  } finally {
    t.cleanup();
  }
});

test("载入：.env 不存在 → 无操作、不抛（与 loadEnvFileInto 的 ENOENT 语义一致）", async () => {
  const t = makeTempEnv(); // 不建文件
  try {
    const env: Record<string, string | undefined> = { KEEP: "1" };
    const res = await loadPiEnv(env, t.envPath);
    assert.deepEqual(res.applied, []);
    assert.equal(env.KEEP, "1", "不存在的 .env 不应改动 env");
  } finally {
    t.cleanup();
  }
});

test("掩码：getPiConfig 对机密键恒返空 value，只给 isSet；非机密键回填真实值", async () => {
  const t = makeTempEnv(["ANS_PI_MODEL=model-a", `ANTHROPIC_AUTH_TOKEN=${SENTINEL_TOKEN}`, "ANS_PI_PROVIDER=anthropic", ""].join("\n"));
  try {
    const view = await getPiConfig(t.envPath);
    assert.equal(view.path, t.envPath);
    const byKey = Object.fromEntries(view.fields.map((f) => [f.key, f]));
    // 机密键：value 空、isSet=true——值绝不外发。
    assert.equal(byKey.ANTHROPIC_AUTH_TOKEN.secret, true);
    assert.equal(byKey.ANTHROPIC_AUTH_TOKEN.value, "", "机密键值绝不外发");
    assert.equal(byKey.ANTHROPIC_AUTH_TOKEN.isSet, true);
    // 非机密键：回填真实值（mark 为 secret=false）。
    assert.equal(byKey.ANS_PI_MODEL.secret, false);
    assert.equal(byKey.ANS_PI_MODEL.value, "model-a");
    assert.equal(byKey.ANS_PI_MODEL.isSet, true);
    // 未设置的键：isSet=false、value 空。
    assert.equal(byKey.ANS_PI_BASE_URL.isSet, false);
    assert.equal(byKey.ANS_PI_BASE_URL.value, "");
    // 反向守卫：`.env` 里**有** ANS_PI_PROVIDER（下面夹具就写了它），但它**不出现在面板字段里**——
    // 面板不再暴露 provider（内部标签、有默认值）。
    assert.equal(byKey.ANS_PI_PROVIDER, undefined, "provider 不出现在面板字段里（即便 .env 有它）");
    // 哨兵 token 绝不出现在序列化后的整个视图里。
    assert.ok(!JSON.stringify(view).includes(SENTINEL_TOKEN), "token 绝不出现在面板视图里");
    // 缺项判定只给**必填**键名：token/model 已设，端点未设 → 仅 ANS_PI_BASE_URL；
    // 可选的 ANS_PI_CONTEXT_WINDOW 缺失**不**计入（留空 = 保守默认，不算配置不全）。
    assert.deepEqual(missingPiKeys(view).sort(), ["ANS_PI_BASE_URL"]);
  } finally {
    t.cleanup();
  }
});

test("掩码：.env 不存在 → 视图为空、各键 isSet=false（不抛）", async () => {
  const t = makeTempEnv();
  try {
    const view = await getPiConfig(t.envPath);
    assert.equal(view.fields.length, PI_PANEL_KEYS.length);
    assert.ok(view.fields.every((f) => !f.isSet && f.value === ""));
  } finally {
    t.cleanup();
  }
});

test("保存：只动指定键、逐字节保留其余内容（注释/空行/未知键/其它键/顺序）", async () => {
  const original = [
    "# 我的 .env（注释须原样保留）",
    "",
    "SOME_OTHER_KEY=keep-me",
    "ANS_PI_MODEL=old-model",
    "ANS_PI_PROVIDER=anthropic   # 行内注释",
    "export ANS_PI_BASE_URL='https://old.example/v1'",
    "",
  ].join("\n");
  const t = makeTempEnv(original);
  try {
    const env: Record<string, string | undefined> = {};
    const res = await savePiConfig({ envPath: t.envPath, updates: { ANS_PI_MODEL: "new-model" }, env });
    assert.equal(res.ok, true);
    assert.deepEqual(res.appliedKeys, ["ANS_PI_MODEL"]);

    const after = fs.readFileSync(t.envPath, "utf8");
    const beforeLines = original.split("\n");
    const afterLines = after.split("\n");
    assert.equal(afterLines.length, beforeLines.length, "行数不变（未重写整份）");
    let changed = 0;
    for (let i = 0; i < beforeLines.length; i++) {
      if (beforeLines[i] !== afterLines[i]) {
        changed += 1;
        assert.ok(afterLines[i].startsWith("ANS_PI_MODEL="), "唯一变化应是命中键所在行");
        assert.ok(afterLines[i].includes("new-model"));
      }
    }
    assert.equal(changed, 1, "只应有一行改变");
    // 注释、未知键、行内注释、引号与原风格原样保留。
    assert.ok(after.includes("# 我的 .env（注释须原样保留）"));
    assert.ok(after.includes("SOME_OTHER_KEY=keep-me"));
    assert.ok(after.includes("ANS_PI_PROVIDER=anthropic   # 行内注释"));
    assert.ok(after.includes("export ANS_PI_BASE_URL='https://old.example/v1'"));
    // 保存后重载：env 用新值。
    assert.equal(env.ANS_PI_MODEL, "new-model");
  } finally {
    t.cleanup();
  }
});

test("保存：缺键追加到末尾（含机密键），且面板键过滤掉非面板键", async () => {
  const t = makeTempEnv("ANS_PI_MODEL=m\n");
  try {
    const env: Record<string, string | undefined> = {};
    const res = await savePiConfig({
      envPath: t.envPath,
      // 混入一个非面板键——必须被过滤掉，绝不写进 .env。
      updates: { ANS_PI_BASE_URL: "https://b.test", ANTHROPIC_AUTH_TOKEN: SENTINEL_TOKEN, NOT_A_PANEL_KEY: "nope" },
      env,
    });
    assert.equal(res.ok, true);
    assert.deepEqual([...res.appliedKeys].sort(), ["ANTHROPIC_AUTH_TOKEN", "ANS_PI_BASE_URL"].sort());
    const after = fs.readFileSync(t.envPath, "utf8");
    assert.ok(after.includes("ANS_PI_MODEL=m"), "原有键保留");
    assert.ok(after.includes("ANS_PI_BASE_URL=https://b.test"), "缺键应被追加");
    assert.ok(after.includes(`ANTHROPIC_AUTH_TOKEN=${SENTINEL_TOKEN}`));
    assert.ok(!after.includes("NOT_A_PANEL_KEY"), "非面板键绝不被写入");
    // 重载后 env 带新值（机密键亦进 env）。
    assert.equal(env.ANS_PI_BASE_URL, "https://b.test");
    assert.equal(env.ANTHROPIC_AUTH_TOKEN, SENTINEL_TOKEN);
  } finally {
    t.cleanup();
  }
});

test("保存：ANS_PI_PROVIDER 不再被写——即便提交它也被过滤；已存在的那行原样保留（只改相关键）", async () => {
  // 客户 2026-10-11：provider 从面板移除。保存只改面板键；provider 已不在面板键集合里。
  const original = ["ANS_PI_MODEL=m", "ANS_PI_PROVIDER=ans-gateway", ""].join("\n");
  const t = makeTempEnv(original);
  try {
    const env: Record<string, string | undefined> = {};
    const res = await savePiConfig({
      envPath: t.envPath,
      // 混入 provider（旧面板键）——必须被过滤，绝不改动/重写它。
      updates: { ANS_PI_MODEL: "changed", ANS_PI_PROVIDER: "should-not-write" },
      env,
    });
    assert.equal(res.ok, true);
    assert.deepEqual(res.appliedKeys, ["ANS_PI_MODEL"], "provider 不在面板键 → 被过滤，不计入 applied");
    const after = fs.readFileSync(t.envPath, "utf8");
    assert.ok(after.includes("ANS_PI_PROVIDER=ans-gateway"), "已存在的 provider 行原样保留（未被动过）");
    assert.ok(!after.includes("should-not-write"), "提交的 provider 值绝不写入 .env");
    assert.ok(after.includes("ANS_PI_MODEL=changed"));
  } finally {
    t.cleanup();
  }
});

test("凭据不回显：哨兵 token 绝不出现在保存回报或错误文本里（含写失败路径）", async () => {
  // 失败路径：目标在**不存在的父目录**下 → 写必失败；错误文本仍不得含 token 值。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ans-piconf-fail-"));
  const badPath = path.join(dir, "no-such-subdir", ".env");
  try {
    const env: Record<string, string | undefined> = {};
    const res = await savePiConfig({ envPath: badPath, updates: { ANTHROPIC_AUTH_TOKEN: SENTINEL_TOKEN }, env });
    assert.equal(res.ok, false, "写失败应显式返回 ok:false");
    assert.deepEqual(res.appliedKeys, []);
    assert.ok(typeof res.error === "string" && res.error.length > 0, "应给出错误原因");
    assert.ok(!res.error!.includes(SENTINEL_TOKEN), "错误文本绝不包含 token 值");
    assert.ok(!JSON.stringify(res).includes(SENTINEL_TOKEN), "整个回报绝不包含 token 值");
    // 未越界创建任何文件/目录。
    assert.ok(!fs.existsSync(path.join(dir, "no-such-subdir")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("保存：无面板键可写时恒等（不触碰文件、回报空 apply）", async () => {
  const t = makeTempEnv("ANS_PI_MODEL=m\n");
  const before = fs.readFileSync(t.envPath, "utf8");
  try {
    const res = await savePiConfig({ envPath: t.envPath, updates: { NOT_A_PANEL_KEY: "x" }, env: {} });
    assert.equal(res.ok, true);
    assert.deepEqual(res.appliedKeys, []);
    assert.equal(fs.readFileSync(t.envPath, "utf8"), before, "无面板键 → 文件逐字节不变");
  } finally {
    t.cleanup();
  }
});

// ————————————————— 经 interface.ts 的接线 —————————————————

test("interface：getPiConfig/savePiConfig 经注入的临时路径读写（不碰真实仓库根 .env）", async () => {
  const t = makeTempEnv("# seed\nSOME_KEY=1\n");
  try {
    const iface = createDesktopInterface({
      pickDirectory: async () => null,
      emitEvent: () => {},
      // ⚠ 注入临时路径；piConfigEnv 用独立对象，避免污染真实 process.env。
      envFilePath: t.envPath,
      piConfigEnv: {},
    });

    // 初始：仅 SOME_KEY，面板键皆未设置。
    const view0 = await iface.getPiConfig();
    assert.equal(view0.path, t.envPath);
    assert.ok(view0.fields.every((f) => !f.isSet));

    // 保存 3 个面板键（含 token）。
    const saved = await iface.savePiConfig({
      updates: { ANS_PI_MODEL: "model-x", ANS_PI_CONTEXT_WINDOW: "200000", ANTHROPIC_AUTH_TOKEN: SENTINEL_TOKEN },
    });
    assert.equal(saved.ok, true);
    assert.deepEqual([...saved.appliedKeys].sort(), ["ANTHROPIC_AUTH_TOKEN", "ANS_PI_CONTEXT_WINDOW", "ANS_PI_MODEL"].sort());
    assert.ok(!JSON.stringify(saved).includes(SENTINEL_TOKEN), "回报不含 token 值");

    // 视图：token 仍掩码（value 空、isSet true）；非机密回填。
    const view1 = await iface.getPiConfig();
    const byKey = Object.fromEntries(view1.fields.map((f) => [f.key, f]));
    assert.equal(byKey.ANTHROPIC_AUTH_TOKEN.value, "");
    assert.equal(byKey.ANTHROPIC_AUTH_TOKEN.isSet, true);
    assert.equal(byKey.ANS_PI_MODEL.value, "model-x");
    assert.equal(byKey.ANS_PI_CONTEXT_WINDOW.value, "200000");
    assert.ok(!JSON.stringify(view1).includes(SENTINEL_TOKEN), "token 绝不外发到渲染进程（视图）");

    // 未知键被过滤。
    const saved2 = await iface.savePiConfig({ updates: { NOPE: "z" } });
    assert.deepEqual(saved2.appliedKeys, []);
    assert.ok(!fs.readFileSync(t.envPath, "utf8").includes("NOPE"));
    // 原有未知键保留。
    assert.ok(fs.readFileSync(t.envPath, "utf8").includes("SOME_KEY=1"));
  } finally {
    t.cleanup();
  }
});
