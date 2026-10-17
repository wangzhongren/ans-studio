// 测试角色：T29 独立验收（其一）——**Pi 配置往返**（端到端）+ 单一来源/签名纪律。
//
// 归属：test/测试/（测试角色 Section 1）。**独立**自写用例——**不复用**桌面角色
// （`test/桌面应用/pi-config.test.ts`，T28 自证）或项目管理角色（`test/项目管理/shared/env-file.test.ts`，T26 自证）
// 的任何夹具/断言；本文件自行搭临时 `.env`、自行做字节级比对。
//
// **隔离红线**：全程只碰系统临时目录（`os.tmpdir()` 下 `mkdtemp`），**绝不读写仓库根真实 `.env`**。
// `resolveRepoEnvPath()` 只被用来**断言它指向仓库根**（只取路径字符串，**不读该文件**）。
//
// 行文依据：设计稿 §11（`角色卡/项目管理/docs/design/2026-10-11_design_v1-full-implementation.md`）。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadPiEnv,
  savePiConfig,
  getPiConfig,
  resolveRepoEnvPath,
  PI_PANEL_KEYS,
} from "../../app/desktop/pi-config.ts";
import {
  getRuntimeConfig,
  saveRuntimeConfig,
} from "../../app/desktop/runtime-config.ts";
import { RUNTIME_SETTINGS } from "../../src/common/shared/runtime-settings.ts";
import {
  loadEnvFileInto,
  readEnvFile,
} from "../../src/common/shared/env-file.ts";
import { resolvePiProviderConfig, DEFAULT_PI_CONTEXT_WINDOW } from "../../src/common/pi-adapter/provider-config.ts";
import { createPiAdapterFactory } from "../../src/pipeline/orchestration/run-role.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

/** 哨兵 token 值——断言它**只**进 env（凭据落点），**绝不**出现在任何回报/错误文本里。 */
const SENTINEL_TOKEN = "SENTINEL-TOKEN-T29-roundtrip-8e17-DO-NOT-LEAK";

/** 造一个系统临时目录（可选写入初始 `.env`）；返回路径与清理函数。 */
function makeTempEnv(initial?: string): { dir: string; envPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ans-t29-rt-"));
  const envPath = path.join(dir, ".env");
  if (initial !== undefined) fs.writeFileSync(envPath, initial, "utf8");
  return { dir, envPath, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** 一组完整的 Pi 配置（含 token）——**我自己构造**的夹具，不经实现方任何写入路径。 */
const FIXTURE = [
  "# Pi 网关配置（注释行须保留）",
  `ANTHROPIC_AUTH_TOKEN="${SENTINEL_TOKEN}"`,
  "ANS_PI_BASE_URL=https://gw.example.test/v1",
  "ANS_PI_MODEL=test-model-42",
  "ANS_PI_PROVIDER=ans-gateway",
  "ANS_PI_CONTEXT_WINDOW=131072",
  "",
].join("\n");

// —————————————————————— 1) 写盘 → 载入：值(含 token)正确到达 env ——————————————————————

test("T29 往返：临时 .env 载入后，进程 env 拿到正确值（含 token），且回报只含键名", async () => {
  const t = makeTempEnv(FIXTURE);
  try {
    const env: Record<string, string | undefined> = {};
    const res = await loadPiEnv(env, t.envPath);

    // 非机密键：值逐字到达。
    assert.equal(env["ANS_PI_BASE_URL"], "https://gw.example.test/v1");
    assert.equal(env["ANS_PI_MODEL"], "test-model-42");
    assert.equal(env["ANS_PI_PROVIDER"], "ans-gateway");
    assert.equal(env["ANS_PI_CONTEXT_WINDOW"], "131072");
    // 机密键：值也**必须**到达 env（token 的落点就是 env；pi 运行时从 env 读它）。
    assert.equal(env["ANTHROPIC_AUTH_TOKEN"], SENTINEL_TOKEN);

    // 回报结构：路径正确，applied 只需键名、**不含值**。
    assert.equal(res.path, t.envPath);
    // applied = **文件里实际载入的全部键名**（含非面板键 `ANS_PI_PROVIDER`——它仍是被读取的环境变量，
    // 只是自 2026-10-11 起**不再占面板输入框**，故**不能**再拿它去等 `PI_PANEL_KEYS`）。
    assert.deepEqual(
      [...res.applied].sort(),
      [
        "ANTHROPIC_AUTH_TOKEN",
        "ANS_PI_BASE_URL",
        "ANS_PI_CONTEXT_WINDOW",
        "ANS_PI_MODEL",
        "ANS_PI_PROVIDER",
      ].sort(),
    );
    // 面板键集合（单一来源 = `pi-config.ts` 的 `PI_PANEL_KEYS`；G-5 wave 2 起与注册表 `RUNTIME_SETTINGS.pi`
    // 字段集对齐）：**3 必填 + 3 可选 = 6**（增 `ANS_PI_REASONING_EFFORT`；2026-10-17 Pi 滑块批次再增
    // `ANS_PI_PROMPT_TIMEOUT_MS`——整轮超时滑块）。
    assert.deepEqual(
      [...PI_PANEL_KEYS].sort(),
      [
        "ANTHROPIC_AUTH_TOKEN",
        "ANS_PI_BASE_URL",
        "ANS_PI_CONTEXT_WINDOW",
        "ANS_PI_MODEL",
        "ANS_PI_PROMPT_TIMEOUT_MS",
        "ANS_PI_REASONING_EFFORT",
      ].sort(),
    );
    // 反向守卫：`ANS_PI_PROVIDER` **不在**面板键里（代码里有默认值 `ans-gateway`，是内部标签、非用户该填）。
    // 用反向守卫（断言它**不在**）而非删行——防它悄悄长回面板。
    assert.ok(
      !PI_PANEL_KEYS.includes("ANS_PI_PROVIDER"),
      "ANS_PI_PROVIDER 不应出现在面板键里（内部标识、有代码默认值）",
    );
    assert.ok(!JSON.stringify(res).includes(SENTINEL_TOKEN), "LoadEnvResult 不得回显 token 值");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 2) 载入后 → resolvePiProviderConfig 能以这批配置构造 ——————————————————————
//
// 这是「配置真能到达适配器」的关键一环：桌面把 .env 载进 process.env 后，
// `real-adapter.ts` 里的 `resolvePiProviderConfig(opts, process.env)` 原样复用（设计 §11.3）。
// 本用例**只**验证「配置能正确到达适配器构造」，**不**发起任何真实模型调用（见文末「验证不到」）。

test("T29 往返：载入后 resolvePiProviderConfig 成功构造（baseUrl/modelId/contextWindow/provider 正确）", async () => {
  const t = makeTempEnv(FIXTURE);
  try {
    const env: Record<string, string | undefined> = {};
    await loadEnvFileInto(env, t.envPath);

    const cfg = resolvePiProviderConfig({}, env);
    assert.equal(cfg.baseUrl, "https://gw.example.test/v1");
    assert.equal(cfg.modelId, "test-model-42");
    assert.equal(cfg.contextWindow, 131072); // 字符串 "131072" → number
    assert.equal(typeof cfg.contextWindow, "number");
    assert.equal(cfg.providerId, "ans-gateway");
    assert.equal(cfg.apiKeyEnvVar, "ANTHROPIC_AUTH_TOKEN");
    // 凭据只检查存在性，绝不回显——构造结果里没有 token 值。
    assert.ok(!JSON.stringify(cfg).includes(SENTINEL_TOKEN), "构造结果不得含 token 值");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 2b) 上下文窗口可选（新语义）：缺失 → 不硬失败，回落系统默认值 ——————————————
//
// 客户 2026-10-11 裁定：`ANS_PI_CONTEXT_WINDOW` 从「必填」改为**可选**（面板里收进「高级」、**可留空**）。
// 留空 = **不下发该键**，Pi适配器回落**系统默认值**（不抛错，只在日志/事件流给可见提示）。
// 用**反向守卫**：断言「缺失**不抛错**」且取到默认值——防「必填」旧语义长回来。

test("T29 往返：ANS_PI_CONTEXT_WINDOW 缺失 → 不硬失败，采用系统默认值（新语义）", async () => {
  // 刻意**不写** context window：模拟「高级项留空」。
  const t = makeTempEnv(
    [
      `ANTHROPIC_AUTH_TOKEN="${SENTINEL_TOKEN}"`,
      "ANS_PI_BASE_URL=https://gw.example.test/v1",
      "ANS_PI_MODEL=test-model-42",
      "",
    ].join("\n"),
  );
  try {
    const env: Record<string, string | undefined> = {};
    await loadEnvFileInto(env, t.envPath);
    assert.equal(env["ANS_PI_CONTEXT_WINDOW"], undefined, "本夹具刻意不含 context window");

    // 缺失**不应抛错**（旧语义会硬失败）。
    const cfg = resolvePiProviderConfig({}, env);
    assert.equal(cfg.contextWindow, DEFAULT_PI_CONTEXT_WINDOW, "缺失应回落到系统默认值");
    assert.equal(DEFAULT_PI_CONTEXT_WINDOW, 500000, "系统默认值应钉死为 500000（客户 2026-10-17 裁定）");
    assert.equal(cfg.contextWindowSource, "default", "来源应如实标注为 default（供适配器给可见提示）");
    assert.ok(!JSON.stringify(cfg).includes(SENTINEL_TOKEN), "构造结果不得含 token 值");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 3) 保存后重载：改一个值 → 保存 → 重载 → 新值生效并到达适配器 ——————————————————————

test("T29 往返：savePiConfig 改值 → 立即重载生效 + 新开 env 重载生效 + 适配器构造取到新值", async () => {
  const t = makeTempEnv(FIXTURE);
  try {
    const env: Record<string, string | undefined> = {};
    await loadEnvFileInto(env, t.envPath);
    assert.equal(resolvePiProviderConfig({}, env).modelId, "test-model-42");

    // 改 modelId 与 contextWindow：保存。
    const r = await savePiConfig({
      envPath: t.envPath,
      updates: { ANS_PI_MODEL: "test-model-99", ANS_PI_CONTEXT_WINDOW: "200000" },
      env,
    });
    assert.equal(r.ok, true, `保存应成功：${r.error ?? ""}`);
    assert.deepEqual([...r.appliedKeys].sort(), ["ANS_PI_CONTEXT_WINDOW", "ANS_PI_MODEL"]);

    // 甲) 保存后**同一 env** 已被重载（下一会话用新值）。
    assert.equal(env["ANS_PI_MODEL"], "test-model-99");
    assert.equal(env["ANS_PI_CONTEXT_WINDOW"], "200000");

    // 乙) **另开**一个 env 从盘上重载，同样拿到新值（确认真落盘，非仅内存）。
    const env2: Record<string, string | undefined> = {};
    await loadEnvFileInto(env2, t.envPath);
    assert.equal(env2["ANS_PI_MODEL"], "test-model-99");
    assert.equal(env2["ANS_PI_CONTEXT_WINDOW"], "200000");

    // 丙) 新值**到达适配器构造**。
    const cfg = resolvePiProviderConfig({}, env2);
    assert.equal(cfg.modelId, "test-model-99");
    assert.equal(cfg.contextWindow, 200000);
  } finally {
    t.cleanup();
  }
});

test("T29 往返：旧值仍在（只改相关键——载入不因保存而丢其它键）", async () => {
  const t = makeTempEnv(FIXTURE);
  try {
    const env: Record<string, string | undefined> = {};
    await loadEnvFileInto(env, t.envPath);
    await savePiConfig({ envPath: t.envPath, updates: { ANS_PI_MODEL: "changed" }, env });

    const re = await readEnvFile(t.envPath);
    assert.equal(re["ANS_PI_BASE_URL"], "https://gw.example.test/v1");
    assert.equal(re["ANS_PI_PROVIDER"], "ans-gateway");
    assert.equal(re["ANS_PI_CONTEXT_WINDOW"], "131072");
    assert.equal(re["ANTHROPIC_AUTH_TOKEN"], SENTINEL_TOKEN);
    assert.equal(re["ANS_PI_MODEL"], "changed");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 3b) G-5 推理强度：往返 ＋ choices 透传 ＋ 值域单一来源 ——————————————————————
//
// 批准件＝PM 记录 §G-5 与桌面窗口/项目管理属主回交：`ANS_PI_REASONING_EFFORT` 纳入面板键（pi-config.ts
// 「纳入」处理）并与注册表 `RUNTIME_SETTINGS.pi` 逐键对齐（漂移守卫）；choices 元数据经注册表读取链透传；
// 值域校验**单一来源**在注册表保存链（`runtime-config.ts` 按 `field.choices` 判）——旧面板路径**不做**
// 值域校验（如实钉：不复制第二份判定，沿单一来源纪律）。

test("T29 G-5：ANS_PI_REASONING_EFFORT 往返（save→reload→get 视图）＋ 面板键与注册表逐键对齐（漂移守卫）", async () => {
  // 漂移守卫：面板键集 ≡ 注册表 RUNTIME_SETTINGS.pi 字段键集（G-5 wave 2「纳入」口径）。
  assert.deepEqual(
    [...PI_PANEL_KEYS].sort(),
    RUNTIME_SETTINGS.pi.fields.map((f) => f.key).sort(),
    "面板键集须与 RUNTIME_SETTINGS.pi 字段集逐键对齐（防漂移）",
  );
  const t = makeTempEnv(FIXTURE);
  try {
    const env: Record<string, string | undefined> = {};
    await loadEnvFileInto(env, t.envPath);
    assert.equal(env["ANS_PI_REASONING_EFFORT"], undefined, "本夹具刻意不含推理强度（起点未设）");

    const r = await savePiConfig({ envPath: t.envPath, updates: { ANS_PI_REASONING_EFFORT: "high" }, env });
    assert.equal(r.ok, true, `保存应成功：${r.error ?? ""}`);
    assert.deepEqual(r.appliedKeys, ["ANS_PI_REASONING_EFFORT"]);
    // 甲) 保存后同一 env 已重载。
    assert.equal(env["ANS_PI_REASONING_EFFORT"], "high");
    // 乙) 另开 env 从盘上重载也拿到（确认真落盘）。
    const env2: Record<string, string | undefined> = {};
    await loadEnvFileInto(env2, t.envPath);
    assert.equal(env2["ANS_PI_REASONING_EFFORT"], "high");
    // 丙) get 面板视图含新键（非机密、值可见、isSet）。
    const view = await getPiConfig(t.envPath);
    const field = view.fields.find((f) => f.key === "ANS_PI_REASONING_EFFORT");
    assert.ok(field, "get 视图须含新键");
    assert.equal(field!.secret, false, "推理强度非机密");
    assert.equal(field!.value, "high");
    assert.equal(field!.isSet, true);
  } finally {
    t.cleanup();
  }
});

test("T29 G-5：choices 元数据透传（注册表读取链）＋值域校验单一来源在注册表保存链（旧面板路径不复制判定，如实钉）", async () => {
  const t = makeTempEnv(FIXTURE);
  try {
    // ① choices 透传：注册表视图把推理强度的封闭值域原样带出（Pi 含 off 档；控件据 choices 呈现）。
    const view = await getRuntimeConfig("pi", { envPath: t.envPath, env: {} });
    const field = view.fields.find((f) => f.key === "ANS_PI_REASONING_EFFORT");
    assert.ok(field, "注册表视图须含推理强度字段");
    assert.deepEqual(field!.choices, ["off", "low", "medium", "high", "xhigh"], "choices 元数据逐字透传");
    assert.equal(field!.required, false, "推理强度为可选（留空＝维持平台默认）");

    // ② 注册表保存链拒非法值（单一来源）：不落盘、错误不回显提交值原文。
    const bad = await saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_REASONING_EFFORT: "bogus" } }, { envPath: t.envPath });
    assert.equal(bad.ok, false, "非法档位由注册表保存链如实拒绝");
    assert.ok(
      bad.error?.includes("取值无效") === true && bad.error.includes("off / low / medium / high / xhigh"),
      `错误须列出合法值域：${bad.error}`,
    );
    assert.equal((bad.error ?? "").includes("bogus"), false, "拒绝错误不得回显提交值原文");
    assert.equal((await readEnvFile(t.envPath))["ANS_PI_REASONING_EFFORT"], undefined, "被拒 ⇒ 不落盘（零副作用）");

    // ③ 注册表保存链收合法值：trim 后规范形写盘。
    const good = await saveRuntimeConfig({ runtime: "pi", updates: { ANS_PI_REASONING_EFFORT: " xhigh " } }, { envPath: t.envPath });
    assert.equal(good.ok, true, `合法档位应写入：${good.error ?? ""}`);
    assert.deepEqual(good.appliedKeys, ["ANS_PI_REASONING_EFFORT"]);
    assert.equal((await readEnvFile(t.envPath))["ANS_PI_REASONING_EFFORT"], "xhigh", "规范形（trim 后）写盘");

    // ④ 旧面板路径不做值域校验（单一来源纪律，如实钉）：savePiConfig 只过滤键面、不复制第二份判定。
    const env: Record<string, string | undefined> = {};
    const legacy = await savePiConfig({ envPath: t.envPath, updates: { ANS_PI_REASONING_EFFORT: "bogus" }, env });
    assert.equal(legacy.ok, true, "旧面板路径按键面直写（值域校验只在注册表保存链——不复制第二份）");
    assert.deepEqual(legacy.appliedKeys, ["ANS_PI_REASONING_EFFORT"]);
    assert.equal(env["ANS_PI_REASONING_EFFORT"], "bogus", "旧路径值原样落盘（如实钉：本路径无 choices 控件与值域校验）");
  } finally {
    t.cleanup();
  }
});

// —————————————————————— 4) 单一来源：共享模块是全仓唯一 .env 读写实现 ——————————————————————
//
// 不复用实现方的断言——**我自己遍历 src/ 与 app/ 的 .ts**，确认下列符号**只在** env-file.ts 里定义，
// 且桌面侧（pi-config.ts / main.ts）是**只读导入**消费。

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkTs(p));
    else if (e.isFile() && p.endsWith(".ts")) out.push(p);
  }
  return out;
}

test("T29 单一来源：parse/merge/atomicWrite/read/save/loadEnvFileInto 只在 env-file.ts 定义", () => {
  const shared = path.join(REPO_ROOT, "src", "common", "shared", "env-file.ts");
  const defRe =
    /\bexport\s+(?:async\s+)?function\s+(?:parseEnvFile|mergeEnvText|atomicWriteText|readEnvFile|saveEnvFile|loadEnvFileInto)\b/;
  const definers: string[] = [];
  for (const f of [...walkTs(path.join(REPO_ROOT, "src")), ...walkTs(path.join(REPO_ROOT, "app"))]) {
    if (defRe.test(fs.readFileSync(f, "utf8"))) definers.push(path.relative(REPO_ROOT, f));
  }
  assert.deepEqual(definers, [path.relative(REPO_ROOT, shared)],
    `共享 .env 读写符号应**只在** env-file.ts 定义；实际定义处：${JSON.stringify(definers)}`);
});

test("T29 单一来源：桌面侧只读导入共享模块（无第二份实现）", () => {
  const piConfig = fs.readFileSync(path.join(REPO_ROOT, "app", "desktop", "pi-config.ts"), "utf8");
  const main = fs.readFileSync(path.join(REPO_ROOT, "app", "main.ts"), "utf8");
  for (const [name, src] of [["pi-config.ts", piConfig], ["main.ts", main]] as const) {
    assert.match(src, /from "\.\.?\/[\w./-]*common\/shared\/env-file\.ts"/,
      `${name} 应从共享 env-file.ts 导入（单一来源）`);
  }
  // 不得自带 .env 解析：pi-config.ts 里不得出现「自己 split('=') 解析 .env」的痕迹。
  assert.ok(!/function\s+parseEnvFile/.test(piConfig), "pi-config.ts 不得自带 parseEnvFile");
});

// —————————————————————— 5) 签名纪律：桌面未扩 createPiAdapterFactory / resolvePiProviderConfig ——————————

test("T29 签名：resolvePiProviderConfig 与 createPiAdapterFactory 形参未扩（均为 2 参）", () => {
  // 方案裁定（§11.3）：**不扩** createPiAdapterFactory 签名；resolvePiProviderConfig 原样复用。
  // 用 Function.length（首个默认值前的形参数）做回归钉。
  assert.equal(resolvePiProviderConfig.length, 2, "resolvePiProviderConfig(input, env) 应为 2 参");
  assert.equal(createPiAdapterFactory.length, 2, "createPiAdapterFactory(project, shellGate?) 应为 2 参");
});

test("T29 签名：默认 .env 路径指向仓库根（只取字符串，不读该文件）", () => {
  const p = resolveRepoEnvPath();
  assert.equal(path.basename(p), ".env");
  assert.equal(path.resolve(p), path.join(REPO_ROOT, ".env"));
});
